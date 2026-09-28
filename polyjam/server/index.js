import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const allowedGoogleEmails = new Set(
    (process.env.ALLOWED_GOOGLE_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLocaleLowerCase())
        .filter(Boolean)
);
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
const fallbackSetlists = new Map();
const fallbackSongs = new Map();
let members;
let setlists;
let songs;
let mongoClient;

app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://kaybiee.github.io",
    ],
}));
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
    response.json({ ok: true, database: members ? "mongodb" : "fallback" });
});

app.get("/", (_request, response) => {
    response.send("Polyjam API is running.");
});

app.get("/api/google/profile", requireAllowedGoogleUser, (request, response) => {
    response.json(request.googleProfile);
});

app.get("/api/spreadsheets/:spreadsheetId/values", requireAllowedGoogleUser, async (request, response) => {
    const spreadsheetId = request.params.spreadsheetId;
    const accessToken = request.headers.authorization;
    const range = typeof request.query.range === "string" ? request.query.range : "'Dispos'!A:ZZ";

    if (!/^[a-zA-Z0-9_-]+$/.test(spreadsheetId)) {
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

app.get("/api/members", requireAllowedGoogleUser, async (_request, response) => {
    try {
        const result = members
            ? await members.find({}).sort({ name: 1 }).toArray()
            : [...fallbackMembers.values()].sort((left, right) => left.name.localeCompare(right.name));
        response.json(result.map((member) => {
            const memberInstruments = member.instruments ?? (member.instrument ? [member.instrument] : []);
            return { ...member, instruments: memberInstruments, mainInstrument: member.mainInstrument ?? (memberInstruments.length === 1 ? memberInstruments[0] : undefined), actif: member.actif !== false };
        }));
    } catch (error) {
        console.error("Failed to read members", error);
        response.status(500).json({ error: "Impossible de charger les membres." });
    }
});

app.delete("/api/members/:memberId", requireAllowedGoogleUser, async (request, response) => {
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

app.put("/api/members/:memberId/instrument", requireAllowedGoogleUser, async (request, response) => {
    const memberId = request.params.memberId.trim();
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const instruments = Array.isArray(request.body?.instruments)
        ? request.body.instruments.filter((value) => typeof value === "string").map((value) => value.trim())
        : typeof request.body?.instrument === "string"
            ? [request.body.instrument.trim()]
            : [];
    const actif = typeof request.body?.actif === "boolean" ? request.body.actif : true;
    const mainInstrument = typeof request.body?.mainInstrument === "string" ? request.body.mainInstrument.trim() : instruments.length === 1 ? instruments[0] : "";

    const nameParts = name.split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ");
    if (!memberId || !name || firstName.length > 20 || lastName.length > 20 || /\s/.test(firstName) || instruments.length === 0 || instruments.some((instrument) => !allowedInstruments.has(instrument)) || !mainInstrument || !instruments.includes(mainInstrument)) {
        response.status(400).json({ error: "Membre ou instrument invalide." });
        return;
    }

    const nameKey = name.toLocaleLowerCase("fr");
    const member = { memberId, name, nameKey, instruments: [...new Set(instruments)], mainInstrument, actif, updatedAt: new Date().toISOString() };

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

app.get("/api/setlists", requireAllowedGoogleUser, async (_request, response) => {
    try {
        const result = setlists
            ? await setlists.find({}).sort({ name: 1 }).toArray()
            : [...fallbackSetlists.values()].sort((left, right) => left.name.localeCompare(right.name));
        const normalized = [];
        for (const setlist of result) {
            if (Array.isArray(setlist.songIds)) {
                normalized.push(setlist);
                continue;
            }
            const songIds = [];
            for (const song of setlist.songs ?? []) {
                const songId = song.songId || randomUUID();
                const reusableSong = {
                    songId,
                    title: song.title,
                    artist: song.artist ?? song.artistMemberId ?? "",
                    staffMemberIds: song.staffMemberIds ?? (song.staffMemberId ? [song.staffMemberId] : []),
                                    staffInstruments: song.staffInstruments ?? {},
                };
                if (songs) await songs.replaceOne({ songId }, reusableSong, { upsert: true });
                else fallbackSongs.set(songId, reusableSong);
                songIds.push(songId);
            }
            const migrated = { ...setlist, songIds };
            delete migrated.songs;
            if (setlists) await setlists.replaceOne({ setlistId: setlist.setlistId }, migrated);
            else fallbackSetlists.set(setlist.setlistId, migrated);
            normalized.push(migrated);
        }
        response.json(normalized);
    } catch (error) {
        console.error("Failed to read setlists", error);
        response.status(500).json({ error: "Impossible de charger les listes." });
    }
});

app.get("/api/songs", requireAllowedGoogleUser, async (_request, response) => {
    try {
        const result = songs
            ? await songs.find({}).sort({ title: 1 }).toArray()
            : [...fallbackSongs.values()].sort((left, right) => left.title.localeCompare(right.title));
        response.json(result.map((song) => ({
            ...song,
            artist: song.artist ?? song.artistMemberId ?? "",
            staffMemberIds: Array.isArray(song.staffMemberIds)
                ? song.staffMemberIds
                : song.staffMemberId
                    ? [song.staffMemberId]
                    : [],
            staffInstruments: song.staffInstruments ?? {},
        })));
    } catch (error) {
        console.error("Failed to read songs", error);
        response.status(500).json({ error: "Impossible de charger les chansons." });
    }
});

app.put("/api/songs/:songId", requireAllowedGoogleUser, async (request, response) => {
    const songId = request.params.songId.trim();
    const song = {
        songId,
        title: typeof request.body?.title === "string" ? request.body.title.trim() : "",
        artist: typeof request.body?.artist === "string" ? request.body.artist.trim() : "",
        staffMemberIds: Array.isArray(request.body?.staffMemberIds)
            ? [...new Set(request.body.staffMemberIds.filter((memberId) => typeof memberId === "string" && memberId))]
            : typeof request.body?.staffMemberId === "string" && request.body.staffMemberId
                ? [request.body.staffMemberId]
                : [],
        staffInstruments: request.body?.staffInstruments && typeof request.body.staffInstruments === "object"
            ? Object.fromEntries(Object.entries(request.body.staffInstruments).filter(([memberId, instrument]) => typeof memberId === "string" && typeof instrument === "string" && instrument.trim()).map(([memberId, instrument]) => [memberId, instrument.trim()]))
            : {},
    };
    if (!songId || !song.title || song.title.length > 100 || !song.artist || song.artist.length > 100 || song.staffMemberIds.length === 0) {
        response.status(400).json({ error: "Chanson invalide." });
        return;
    }
    try {
        const referencedMembers = members
            ? await members.find({ memberId: { $in: song.staffMemberIds } }).toArray()
            : song.staffMemberIds.map((memberId) => fallbackMembers.get(memberId)).filter(Boolean);
        if (referencedMembers.length !== song.staffMemberIds.length) {
            response.status(400).json({ error: "La chanson contient un membre inexistant." });
            return;
        }

        const memberById = new Map(referencedMembers.map((member) => [member.memberId, member]));
        for (const [memberId, instrument] of Object.entries(song.staffInstruments)) {
            const member = memberById.get(memberId);
            const memberInstruments = member?.instruments ?? (member?.instrument ? [member.instrument] : []);
            if (!song.staffMemberIds.includes(memberId) || !allowedInstruments.has(instrument) || !memberInstruments.includes(instrument)) {
                response.status(400).json({ error: "L'instrument assigné à la chanson est invalide." });
                return;
            }
        }

        if (songs) await songs.replaceOne({ songId }, song, { upsert: true });
        else fallbackSongs.set(songId, song);
        response.json(song);
    } catch (error) {
        console.error("Failed to save song", error);
        response.status(500).json({ error: "Impossible d'enregistrer la chanson." });
    }
});

app.delete("/api/songs/:songId", requireAllowedGoogleUser, async (request, response) => {
    const songId = request.params.songId.trim();
    if (!songId) {
        response.status(400).json({ error: "Chanson invalide." });
        return;
    }
    try {
        if (songs) await songs.deleteOne({ songId });
        else fallbackSongs.delete(songId);
        response.json({ message: "Chanson supprimée avec succès." });
    } catch (error) {
        console.error("Failed to delete song", error);
        response.status(500).json({ error: "Impossible de supprimer la chanson." });
    }
});

app.put("/api/setlists/:setlistId", requireAllowedGoogleUser, async (request, response) => {
    const setlistId = request.params.setlistId.trim();
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const songIds = Array.isArray(request.body?.songIds)
        ? [...new Set(request.body.songIds.filter((songId) => typeof songId === "string" && songId))]
        : [];

    if (!setlistId || !name || name.length > 100) {
        response.status(400).json({ error: "Liste ou chanson invalide." });
        return;
    }

    const setlist = { setlistId, name, songIds, updatedAt: new Date().toISOString() };
    try {
        const existingSongs = songs
            ? await songs.find({ songId: { $in: songIds } }).toArray()
            : songIds.map((songId) => fallbackSongs.get(songId)).filter(Boolean);
        if (existingSongs.length !== songIds.length) {
            response.status(400).json({ error: "La liste contient une chanson inexistante." });
            return;
        }

        if (setlists) {
            await setlists.replaceOne({ setlistId }, setlist, { upsert: true });
        } else {
            fallbackSetlists.set(setlistId, setlist);
        }
        response.json(setlist);
    } catch (error) {
        console.error("Failed to save setlist", error);
        response.status(500).json({ error: "Impossible d'enregistrer la liste." });
    }
});

app.delete("/api/setlists/:setlistId", requireAllowedGoogleUser, async (request, response) => {
    const setlistId = request.params.setlistId.trim();
    try {
        if (setlists) {
            await setlists.deleteOne({ setlistId });
        } else {
            fallbackSetlists.delete(setlistId);
        }
        response.json({ message: "Liste supprimée avec succès." });
    } catch (error) {
        console.error("Failed to delete setlist", error);
        response.status(500).json({ error: "Impossible de supprimer la liste." });
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
    setlists = database.collection("setlists");
    songs = database.collection("songs");
    await members.createIndex({ memberId: 1 }, { unique: true });
    await setlists.createIndex({ setlistId: 1 }, { unique: true });
    await songs.createIndex({ songId: 1 }, { unique: true });
    console.log("Connected to MongoDB");
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function requireAllowedGoogleUser(request, response, next) {
    const accessToken = request.headers.authorization;
    if (!accessToken?.startsWith("Bearer ")) {
        response.status(401).json({ error: "Connexion Google requise." });
        return;
    }

    try {
        const googleResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: accessToken },
        });
        if (!googleResponse.ok) {
            response.status(401).json({ error: "Connexion Google invalide." });
            return;
        }

        const googleProfile = await googleResponse.json();
        const email = typeof googleProfile.email === "string" ? googleProfile.email.toLocaleLowerCase() : "";
        if (allowedGoogleEmails.size > 0 && !allowedGoogleEmails.has(email)) {
            response.status(403).json({ error: "Ce compte Google n'est pas autorisé." });
            return;
        }

        request.googleProfile = googleProfile;
        next();
    } catch (error) {
        console.error("Failed to verify Google profile", error);
        response.status(502).json({ error: "Impossible de vérifier le compte Google." });
    }
}

connectDatabase()
    .then(() => {
        app.listen(port, "0.0.0.0", () => {
            const serverUrl = process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`;
            console.log(`Polyjam API listening at ${serverUrl}`);
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
