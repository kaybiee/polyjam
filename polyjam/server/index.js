import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { MongoClient } from "mongodb";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const port = Number(process.env.API_PORT ?? 3001);
const allowedInstruments = new Set([
    "Bass",
    "Batterie",
    "Clavier",
    "Chant",
    "Flûte",
    "Guitare",
    "Saxophone",
    "Trompette",
    "Trombone",
    "Tuba",
    "Violon",
]);
const fallbackMembers = new Map();
let members;
let mongoClient;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
    response.json({ ok: true, database: members ? "mongodb" : "fallback" });
});

app.get("/api/google/profile", async (request, response) => {
    const accessToken = request.headers.authorization;
    if (!accessToken?.startsWith("Bearer ")) {
        response.status(401).json({ error: "Connexion Google requise." });
        return;
    }

    try {
        const googleResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: accessToken },
        });
        const body = await googleResponse.text();
        response.status(googleResponse.status).type("application/json").send(body);
    } catch (error) {
        console.error("Failed to fetch Google profile", error);
        response.status(502).json({ error: "Impossible de récupérer le compte Google." });
    }
});

app.get("/api/spreadsheets/:spreadsheetId/values", async (request, response) => {
    const spreadsheetId = request.params.spreadsheetId;
    const accessToken = request.headers.authorization;
    const range = typeof request.query.range === "string" ? request.query.range : "'Dispos'!A:ZZ";

    if (!/^[a-zA-Z0-9_-]+$/.test(spreadsheetId) || !accessToken?.startsWith("Bearer ")) {
        response.status(400).json({ error: "Requête Google Sheets invalide." });
        return;
    }

    try {
        const googleResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
            { headers: { Authorization: accessToken } }
        );
        const body = await googleResponse.text();
        response.status(googleResponse.status).type("application/json").send(body);
    } catch (error) {
        console.error("Failed to fetch spreadsheet values", error);
        response.status(502).json({ error: "Impossible de joindre Google Sheets." });
    }
});

app.get("/api/members", async (_request, response) => {
    try {
        const result = members
            ? await members.find({}).sort({ name: 1 }).toArray()
            : [...fallbackMembers.values()].sort((left, right) => left.name.localeCompare(right.name));
        response.json(result);
    } catch (error) {
        console.error("Failed to read members", error);
        response.status(500).json({ error: "Impossible de charger les membres." });
    }
});

app.delete("/api/members/:memberId", async (request, response) => {
    const memberId = request.params.memberId.trim();
    if (!memberId) {
        response.status(400).json({ error: "Membre invalide." });
        return;
    }

    try {
        if (members) {
            await members.deleteOne({ memberId });
        } else {
            fallbackMembers.delete(memberId);
        }
        response.json({ message: "Membre supprimé avec succès." });
    } catch (error) {
        console.error("Failed to delete member", error);
        response.status(500).json({ error: "Impossible de supprimer le membre." });
    }
});

app.put("/api/members/:memberId/instrument", async (request, response) => {
    const memberId = request.params.memberId.trim();
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const instruments = Array.isArray(request.body?.instruments)
        ? request.body.instruments.filter((value) => typeof value === "string").map((value) => value.trim())
        : typeof request.body?.instrument === "string"
            ? [request.body.instrument.trim()]
            : [];

    if (!memberId || !name || name.length > 100 || instruments.length === 0 || instruments.some((instrument) => !allowedInstruments.has(instrument))) {
        response.status(400).json({ error: "Membre ou instrument invalide." });
        return;
    }

    const nameKey = name.toLocaleLowerCase("fr");
    const member = { memberId, name, nameKey, instruments: [...new Set(instruments)], updatedAt: new Date().toISOString() };

    try {
        if (members) {
            const duplicate = await members.findOne({
                memberId: { $ne: memberId },
                $or: [{ nameKey }, { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } }],
            });
            if (duplicate) {
                response.status(409).json({ error: "Ce nom est déjà utilisé." });
                return;
            }
            await members.replaceOne({ memberId }, member, { upsert: true });
        } else {
            const duplicate = [...fallbackMembers.values()].some((existingMember) =>
                existingMember.memberId !== memberId && existingMember.nameKey === nameKey
            );
            if (duplicate) {
                response.status(409).json({ error: "Ce nom est déjà utilisé." });
                return;
            }
            fallbackMembers.set(memberId, member);
        }
        response.json(member);
    } catch (error) {
        console.error("Failed to update member", error);
        response.status(500).json({ error: "Impossible d'enregistrer l'instrument." });
    }
});

async function connectDatabase() {
    if (!process.env.MONGODB_URI) {
        console.warn("MONGODB_URI is not set; using in-memory fallback.");
        return;
    }

    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    const database = mongoClient.db(process.env.MONGODB_DATABASE ?? "polyjam");
    members = database.collection("members");
    await members.createIndex({ memberId: 1 }, { unique: true });
    console.log("Connected to MongoDB");
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

connectDatabase()
    .then(() => {
        app.listen(port, "localhost", () => {
            console.log(`Polyjam API listening at http://localhost:${port}`);
        });
    })
    .catch((error) => {
        console.error("MongoDB connection failed", error);
        process.exitCode = 1;
    });

async function shutdown() {
    await mongoClient?.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
