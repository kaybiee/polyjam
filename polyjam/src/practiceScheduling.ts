export type AvailabilityKind = "full" | "firstHalf" | "secondHalf" | "none" | "unknown";

export interface Availability {
    kind: AvailabilityKind;
    first: boolean;
    second: boolean;
    raw: string;
}

export interface AvailabilityPerson {
    name: string;
    availability: Availability;
}

export interface AvailabilityDate {
    date: string;
    event: string;
    people: AvailabilityPerson[];
}

export interface PracticeSong {
    songId: string;
    title: string;
    artist: string;
    staffMemberIds: string[];
    staffInstruments?: Record<string, string>;
}

export interface PracticeMember {
    memberId: string;
    name: string;
    actif: boolean;
    instruments?: string[];
    mainInstrument?: string;
}

export interface ScheduledSong {
    songId: string;
    title: string;
    artist: string;
    startTime: string;
    durationMinutes: number;
    availableStaff: string[];
    missingStaff: string[];
    fullStaff: boolean;
}

export interface PracticeCandidate {
    date: string;
    event: string;
    half?: "first" | "second";
    startTime: string;
    endTime: string;
    songs: ScheduledSong[];
    overflowSongs: string[];
    workload: Record<string, number>;
    staffWorkload: Record<string, number>;
    fullSongCount: number;
    forgivenSongCount: number;
    optionalStaffCount: number;
    excludedSongIds?: string[];
}

export interface PracticeScheduleSource {
    availabilityDate: AvailabilityDate;
    setlistSongs: PracticeSong[];
    members: PracticeMember[];
    forgiveness: number;
    durationMinutes: number;
}

const optionalRoles = new Set(["Backs", "Aux Percs", "Clavier Alt"]);

export function getAvailablePracticeSongs(
    source: PracticeScheduleSource,
    scheduledSongs: ScheduledSong[],
    scheduleStartTime: string,
    scheduleEndTime: string,
    excludedSongIds: string[] = [],
): ScheduledSong[] {
    const slotStart = timeToMinutes(scheduleStartTime);
    const slotEnd = timeToMinutes(scheduleEndTime);
    const cursor = slotStart + scheduledSongs.reduce((total, song) => total + song.durationMinutes, 0);
    const duration = source.durationMinutes;
    if (cursor + duration > slotEnd) return [];

    const midpoint = slotStart + Math.floor((slotEnd - slotStart) / 2);
    const scheduledIds = new Set([...scheduledSongs.map((song) => song.songId), ...excludedSongIds]);
    return source.setlistSongs.flatMap((song) => {
        if (scheduledIds.has(song.songId)) return [];
        const result = buildScheduledSong(
            song,
            source.members,
            source.availabilityDate,
            cursor,
            duration,
            midpoint,
            source.forgiveness,
        );
        return result ? [result.song] : [];
    });
}

export function parseSpreadsheetRows(rows: unknown[][]): AvailabilityDate[] {
    if (!Array.isArray(rows) || !Array.isArray(rows[4])) {
        throw new Error("Le fichier ne respecte pas le format attendu : la ligne 5 doit contenir les noms des personnes.");
    }
    const header = rows[4];
    const personColumns = header.slice(2).map((value, offset) => ({
        index: offset + 2,
        name: String(value ?? "").trim(),
    })).filter((column) => column.name);
    if (personColumns.length === 0) {
        throw new Error("Le fichier ne respecte pas le format attendu : aucun nom de personne n'a été trouvé à partir de la colonne C.");
    }

    const dates = rows.slice(5).flatMap((row) => {
        if (!Array.isArray(row)) return [];
        const date = parseDate(row[0]);
        return date ? [{
            date,
            event: String(row[1] ?? "").trim(),
            people: personColumns.map((column) => ({
                name: column.name,
                availability: parseAvailability(row[column.index]),
            })),
        }] : [];
    });
    if (dates.length === 0) {
        throw new Error("Le fichier ne respecte pas le format attendu : aucune date valide n'a été trouvée à partir de la ligne 6.");
    }
    return dates;
}

export function parseAvailability(value: unknown): Availability {
    const raw = String(value ?? "").trim();
    const normalized = removeAccents(raw).toLocaleLowerCase("fr").replace(/\s+/g, " ");
    if (normalized === "oui") return { kind: "full", first: true, second: true, raw };
    if (normalized === "non" || normalized === "") return { kind: "none", first: false, second: false, raw };
    if (normalized === "premiere moitie") return { kind: "firstHalf", first: true, second: false, raw };
    if (normalized === "deuxieme moitie") return { kind: "secondHalf", first: false, second: true, raw };
    return { kind: "unknown", first: false, second: false, raw };
}

export function generatePracticeCandidates(
    dates: AvailabilityDate[],
    setlistSongs: PracticeSong[],
    members: PracticeMember[],
    startTime: string,
    endTime: string,
    durationMinutes: number,
    forgiveness: number,
): PracticeCandidate[] {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (end <= start || durationMinutes <= 0) return [];
    const midpoint = start + Math.floor((end - start) / 2);
    const candidates: PracticeCandidate[] = [];

    dates.forEach((date) => {
        const slot = { from: start, to: end };
        const songs: ScheduledSong[] = [];
        const overflowSongs: string[] = [];
        const workload: Record<string, number> = {};
        let optionalStaffCount = 0;
        let cursor = slot.from;
        setlistSongs.forEach((song) => {
                if (cursor + durationMinutes > slot.to) {
                    overflowSongs.push(song.title);
                    return;
                }
                const result = buildScheduledSong(song, members, date, cursor, durationMinutes, midpoint, forgiveness);
                if (!result) return;
                optionalStaffCount += result.optionalStaffCount;
                songs.push(result.song);
                cursor += durationMinutes;
                song.staffMemberIds.forEach((id) => { workload[id] = (workload[id] ?? 0) + 1; });
        });
        if (songs.length > 0) {
                const staffWorkload: Record<string, number> = {};
                songs.forEach((song) => song.availableStaff.forEach((staffName) => {
                    staffWorkload[staffName] = (staffWorkload[staffName] ?? 0) + 1;
                }));
            candidates.push({
                    date: date.date,
                    event: date.event,
                    half: undefined,
                    startTime: minutesToTime(slot.from),
                    endTime: minutesToTime(slot.to),
                    songs,
                    overflowSongs,
                    workload,
                    staffWorkload,
                    fullSongCount: songs.filter((song) => song.fullStaff).length,
                    forgivenSongCount: songs.filter((song) => !song.fullStaff).length,
                    optionalStaffCount,
            });
        }
    });
    return candidates;
}

export function sortCandidates(candidates: PracticeCandidate[], mode: "nearest" | "songs", preferredDate?: string) {
    return [...candidates].sort((left, right) => {
        if (preferredDate && left.date !== right.date) {
            if (left.date === preferredDate) return -1;
            if (right.date === preferredDate) return 1;
        }
        const leftWorkload = Object.values(left.workload).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
        const rightWorkload = Object.values(right.workload).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
        const leftDistance = dateDistance(left.date, preferredDate ?? formatIsoDate(new Date()));
        const rightDistance = dateDistance(right.date, preferredDate ?? formatIsoDate(new Date()));
        const leftScore = mode === "nearest"
            ? [left.fullSongCount, left.optionalStaffCount, -leftDistance, left.songs.length, leftWorkload, -left.forgivenSongCount]
            : [left.fullSongCount, left.optionalStaffCount, left.songs.length, leftWorkload, -left.forgivenSongCount, -leftDistance];
        const rightScore = mode === "nearest"
            ? [right.fullSongCount, right.optionalStaffCount, -rightDistance, right.songs.length, rightWorkload, -right.forgivenSongCount]
            : [right.fullSongCount, right.optionalStaffCount, right.songs.length, rightWorkload, -right.forgivenSongCount, -rightDistance];
        for (let index = 0; index < leftScore.length; index++) {
            if (leftScore[index] !== rightScore[index]) return rightScore[index] - leftScore[index];
        }
        return left.date.localeCompare(right.date);
    });
}

export function timeToMinutes(value: string) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
}

export function minutesToTime(value: number) {
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function buildScheduledSong(
    song: PracticeSong,
    members: PracticeMember[],
    date: AvailabilityDate,
    start: number,
    durationMinutes: number,
    midpoint: number,
    forgiveness: number,
) {
    const requiredHalves = start + durationMinutes <= midpoint
        ? ["first" as const]
        : start >= midpoint
            ? ["second" as const]
            : ["first" as const, "second" as const];
    const staff = song.staffMemberIds.map((id) => ({
        id,
        name: members.find((member) => member.memberId === id)?.name ?? "Membre introuvable",
        instrument: song.staffInstruments?.[id] ?? members.find((member) => member.memberId === id)?.mainInstrument ?? "Instrument non défini",
    }));
    const requiredStaff = staff.filter((member) => !optionalRoles.has(member.instrument));
    const optionalStaff = staff.filter((member) => optionalRoles.has(member.instrument));
    const isAvailableForSong = (memberName: string) => {
        const person = findSpreadsheetPerson(memberName, date.people);
        return requiredHalves.every((half) => Boolean(person?.availability[half]));
    };
    const availableRequiredStaff = requiredStaff.filter((member) => isAvailableForSong(member.name));
    const missingRequiredStaff = requiredStaff.filter((member) => !availableRequiredStaff.includes(member));
    const availableOptionalStaff = optionalStaff.filter((member) => isAvailableForSong(member.name));
    const missingOptionalStaff = optionalStaff.filter((member) => !availableOptionalStaff.includes(member));
    const usedSubstituteIds = new Set<string>();
    const substitutes = missingRequiredStaff.flatMap((missingMember) => {
        const member = members.find((item) => item.memberId === missingMember.id);
        const requiredInstrument = song.staffInstruments?.[missingMember.id] ?? member?.mainInstrument;
        const substitute = requiredInstrument && members.find((item) =>
            !usedSubstituteIds.has(item.memberId) &&
            !requiredStaff.some((requiredMember) => requiredMember.id === item.memberId) &&
            (item.instruments ?? []).includes(requiredInstrument) &&
            isAvailableForSong(item.name)
        );
        if (substitute) usedSubstituteIds.add(substitute.memberId);
        return substitute ? [`${substitute.name} (${requiredInstrument})`] : [];
    });
    const missingRequiredNames = missingRequiredStaff.map((member) => `${member.name} (${member.instrument})`);
    if (missingRequiredNames.length > forgiveness || substitutes.length < missingRequiredNames.length) return null;

    return {
        song: {
            songId: song.songId,
            title: song.title,
            artist: song.artist,
            startTime: minutesToTime(start),
            durationMinutes,
            availableStaff: [
                ...availableRequiredStaff.map((member) => `${member.name} (${member.instrument})`),
                ...availableOptionalStaff.map((member) => `${member.name} (${member.instrument})`),
                ...substitutes,
            ],
            missingStaff: [
                ...missingRequiredNames,
                ...missingOptionalStaff.map((member) => `${member.name} (${member.instrument}, optionnel)`),
            ],
            fullStaff: missingRequiredNames.length === 0,
        } satisfies ScheduledSong,
        optionalStaffCount: availableOptionalStaff.length,
    };
}

function findSpreadsheetPerson(memberName: string, people: AvailabilityPerson[]) {
    const normalizedMember = normalizeName(memberName);
    const exactMatch = people.find((person) => normalizeName(person.name) === normalizedMember);
    if (exactMatch) return exactMatch;

    const memberParts = normalizedMember.split(" ");
    const firstName = memberParts[0] ?? "";
    const lastName = memberParts.slice(1).join("");
    const initialMatches = people.filter((person) => {
        const personParts = normalizeName(person.name).split(" ");
        const personFirstName = personParts[0] ?? "";
        const personLastName = personParts.slice(1).join("");
        return personFirstName === firstName && lastName.length > 0 && personLastName.length > 0 && personLastName.length < lastName.length && lastName.startsWith(personLastName);
    });
    if (initialMatches.length === 1) return initialMatches[0];

    const firstNameMatches = people.filter((person) => normalizeName(person.name).split(" ")[0] === firstName);
    return firstNameMatches.length === 1 ? firstNameMatches[0] : undefined;
}

function parseDate(value: unknown): string | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    }
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    const french = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : formatIsoDate(date);
}

function normalizeName(value: string) {
    return removeAccents(value).toLocaleLowerCase("fr").trim().replace(/\s+/g, " ");
}

function removeAccents(value: string) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dateDistance(left: string, right: string) {
    return Math.abs(new Date(`${left}T12:00:00`).getTime() - new Date(`${right}T12:00:00`).getTime());
}

function formatIsoDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
