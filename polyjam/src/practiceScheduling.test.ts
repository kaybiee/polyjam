import assert from "node:assert/strict";
import test from "node:test";
import {
    getAvailablePracticeSongs,
    getAvailabilityDatesInRange,
    getRestrictedStaffUnavailableForSong,
    getSongAttendance,
    getStaffWorkloadKey,
    generatePracticeCandidates,
    minutesToTime,
    parseAvailability,
    parseSpreadsheetRows,
    sortCandidates,
    timeToMinutes,
    type AvailabilityDate,
    type PracticeCandidate,
    type PracticeMember,
    type PracticeScheduleSource,
    type PracticeSong,
    type ScheduledSong,
} from "./practiceScheduling.ts";

function makeDate(...people: AvailabilityDate["people"]): AvailabilityDate {
    return { date: "2026-10-20", event: "Practice", people };
}

function makeSong(songId: string, staffMemberIds: string[] = [], readiness = 0): PracticeSong {
    return { songId, title: songId, artist: "Artist", staffMemberIds, readiness };
}

function makeMember(memberId: string, name: string, mainInstrument = "Guitar", instruments: string[] = []): PracticeMember {
    return { memberId, name, actif: true, mainInstrument, instruments };
}

function makeSource(overrides: Partial<PracticeScheduleSource> = {}): PracticeScheduleSource {
    return {
        availabilityDate: makeDate(),
        setlistSongs: [],
        members: [],
        forgiveness: 0,
        durationMinutes: 30,
        ...overrides,
    };
}

function makeScheduledSong(songId: string, startTime: string, durationMinutes = 30): ScheduledSong {
    return {
        songId,
        title: songId,
        artist: "Artist",
        startTime,
        durationMinutes,
        availableStaff: [],
        missingStaff: [],
        fullStaff: true,
        readiness: 0,
    };
}

test("parseAvailability normalizes accents and reports unsupported values", () => {
    assert.deepEqual(parseAvailability("  PREMIÈRE   MOITIÉ "), {
        kind: "firstHalf",
        first: true,
        second: false,
        raw: "PREMIÈRE   MOITIÉ",
    });
    assert.equal(parseAvailability("maybe").kind, "unknown");
    assert.deepEqual(parseAvailability(""), { kind: "none", first: false, second: false, raw: "" });
    assert.deepEqual(parseAvailability(null), { kind: "none", first: false, second: false, raw: "" });
    assert.equal(parseAvailability(" OUI ").kind, "full");
    assert.equal(parseAvailability("NON").kind, "none");
    assert.equal(parseAvailability("deuxième moitié").kind, "secondHalf");
});

test("getAvailabilityDatesInRange uses a seven-day default and rejects invalid ranges", () => {
    const dates = ["2026-10-15", "2026-10-16", "2026-10-22", "2026-10-23"].map((date) => ({ ...makeDate(), date }));

    assert.deepEqual(getAvailabilityDatesInRange(dates, "2026-10-16").map(({ date }) => date), [
        "2026-10-16",
        "2026-10-22",
        "2026-10-23",
    ]);
    assert.deepEqual(getAvailabilityDatesInRange(dates, "2026-10-16", "2026-10-16").map(({ date }) => date), ["2026-10-16"]);
    assert.deepEqual(getAvailabilityDatesInRange(dates, "2026-10-16", "2026-10-15"), []);
    assert.deepEqual(getAvailabilityDatesInRange(dates, ""), []);
    assert.deepEqual(getAvailabilityDatesInRange(dates, "invalid"), []);
});

test("parseSpreadsheetRows handles Excel, French, ISO dates, and invalid rows", () => {
    const rows: unknown[][] = [
        [], [], [], [],
        ["Date", "Event", " Alice ", "", null],
        [46245, null, "oui", "ignored"],
        ["21/10/2026", "Répétition", "première moitié"],
        ["2026-10-22T12:00:00", "Show", "non"],
        ["not a date", "Skipped", "oui"],
        [null, "Skipped", "oui"],
        [Infinity, "Skipped", "oui"],
        null as unknown as unknown[],
    ];

    assert.deepEqual(parseSpreadsheetRows(rows), [
        { date: "2026-08-11", event: "", people: [{ name: "Alice", availability: parseAvailability("oui") }] },
        { date: "2026-10-21", event: "Répétition", people: [{ name: "Alice", availability: parseAvailability("première moitié") }] },
        { date: "2026-10-22", event: "Show", people: [{ name: "Alice", availability: parseAvailability("non") }] },
    ]);
});

test("parseSpreadsheetRows rejects missing headers, names, and valid dates", () => {
    assert.throws(() => parseSpreadsheetRows([]), /ligne 5 doit contenir/);
    assert.throws(() => parseSpreadsheetRows([[], [], [], [], ["Date", "Event"]]), /aucun nom de personne/);
    assert.throws(() => parseSpreadsheetRows([[], [], [], [], ["Date", "Event", "Alice"], ["bad"]]), /aucune date valide/);
});

test("time and workload helpers preserve formatting and strip role suffixes", () => {
    assert.equal(timeToMinutes("09:05"), 545);
    assert.equal(minutesToTime(545), "09:05");
    assert.equal(getStaffWorkloadKey("Alice Example (Guitar)"), "Alice Example");
    assert.equal(getStaffWorkloadKey("Alice Example"), "Alice Example");
});

test("getAvailablePracticeSongs filters occupied and excluded songs and sorts by readiness", () => {
    const source = makeSource({
        setlistSongs: [
            makeSong("later", [], 8),
            makeSong("excluded"),
            makeSong("earlier", [], 2),
            { ...makeSong("default-readiness"), readiness: undefined },
            makeSong("occupied"),
        ],
    });
    const available = getAvailablePracticeSongs(
        source,
        [makeScheduledSong("occupied", "12:00")],
        "12:00",
        "13:00",
        ["excluded"],
    );

    assert.deepEqual(available.map(({ songId, startTime }) => [songId, startTime]), [
        ["default-readiness", "12:30"],
        ["earlier", "12:30"],
        ["later", "12:30"],
    ]);
});

test("getAvailablePracticeSongs can target a replacement or an occupied slot", () => {
    const source = makeSource({ setlistSongs: [makeSong("replacement"), makeSong("new")] });
    const occupied = makeScheduledSong("replacement", "12:00", 20);

    assert.deepEqual(
        getAvailablePracticeSongs(source, [occupied], "12:00", "13:00", [], "replacement").map(({ songId, startTime, durationMinutes }) => [songId, startTime, durationMinutes]),
        [["replacement", "12:00", 20], ["new", "12:00", 20]],
    );
    assert.deepEqual(
        getAvailablePracticeSongs(source, [occupied], "12:00", "13:00", [], undefined, true).map(({ songId, startTime }) => [songId, startTime]),
        [["new", "12:00"]],
    );
});

test("getAvailablePracticeSongs returns no song when staff cannot attend or duration exceeds slot", () => {
    const member = makeMember("alice", "Alice Example");
    const source = makeSource({
        setlistSongs: [makeSong("song", ["alice"])],
        members: [member],
        availabilityDate: makeDate({ name: member.name, availability: parseAvailability("non") }),
    });

    assert.deepEqual(getAvailablePracticeSongs(source, [], "12:00", "12:20"), []);
    assert.deepEqual(getAvailablePracticeSongs({ ...source, durationMinutes: 45 }, [], "12:00", "12:30"), []);
});

test("getAvailablePracticeSongs matches abbreviated surnames and unique first names", () => {
    const member = makeMember("alice", "Alice Example");
    const source = makeSource({
        setlistSongs: [makeSong("song", ["alice"])],
        members: [member],
        availabilityDate: makeDate({ name: "Alice Ex", availability: parseAvailability("oui") }),
    });
    const abbreviated = getAvailablePracticeSongs(source, [], "12:00", "12:30");
    const firstNameOnly = getAvailablePracticeSongs({
        ...source,
        availabilityDate: makeDate({ name: "Alice", availability: parseAvailability("oui") }),
    }, [], "12:00", "12:30");
    const ambiguous = getAvailablePracticeSongs({
        ...source,
        availabilityDate: makeDate(
            { name: "Alice One", availability: parseAvailability("oui") },
            { name: "Alice Two", availability: parseAvailability("oui") },
        ),
    }, [], "12:00", "12:30");

    assert.equal(abbreviated.length, 1);
    assert.equal(firstNameOnly.length, 1);
    assert.deepEqual(ambiguous, []);
});

test("getRestrictedStaffUnavailableForSong detects half-day conflicts and skips unknown people", () => {
    const source = makeSource({
        setlistSongs: [makeSong("song", ["first", "second", "missing", "unknown"])],
        members: [
            makeMember("first", "First Person"),
            makeMember("second", "Second Person"),
            makeMember("unknown", "Unknown Person"),
        ],
        availabilityDate: makeDate(
            { name: "First Person", availability: parseAvailability("première moitié") },
            { name: "Second Person", availability: parseAvailability("deuxième moitié") },
        ),
    });

    assert.deepEqual(getRestrictedStaffUnavailableForSong(source, "song", "12:30", 30, "12:00", "13:00"), ["First Person"]);
    assert.deepEqual(getRestrictedStaffUnavailableForSong(source, "song", "12:00", 30, "12:00", "13:00"), ["Second Person"]);
    assert.deepEqual(getRestrictedStaffUnavailableForSong(source, "absent", "12:00", 30, "12:00", "13:00"), []);
});

test("getSongAttendance chooses the half with fewest absences and ignores optional roles", () => {
    const song = {
        ...makeSong("song", ["first", "second", "optional", "missing"]),
        staffInstruments: { optional: "Backs" },
    };
    const members = [
        makeMember("first", "First Person"),
        makeMember("second", "Second Person"),
        makeMember("optional", "Optional Person"),
        { memberId: "missing", name: "Missing Instrument", actif: true },
    ];
    const attendance = getSongAttendance(song, members, makeDate(
        { name: "First Person", availability: parseAvailability("première moitié") },
        { name: "Second Person", availability: parseAvailability("deuxième moitié") },
        { name: "Optional Person", availability: parseAvailability("non") },
    ), "12:00", "13:00", 30);

    assert.equal(attendance.requiredStaffCount, 3);
    assert.deepEqual(attendance.missingStaff, [
        { name: "Second Person", instrument: "Guitar" },
        { name: "Missing Instrument", instrument: "Instrument non défini" },
    ]);
});

test("getSongAttendance handles no fitting interval and absent members", () => {
    const song = makeSong("song", ["missing"]);

    assert.deepEqual(getSongAttendance(song, [], makeDate(), "12:00", "12:00"), {
        requiredStaffCount: 0,
        missingStaff: [],
        missingCount: 0,
    });
    assert.deepEqual(getSongAttendance(makeSong("unavailable", ["person"]), [makeMember("person", "Person")], makeDate(), "12:00", "12:10", 15), {
        requiredStaffCount: 1,
        missingStaff: [{ name: "Person", instrument: "Guitar" }],
        missingCount: 1,
    });
});

test("generatePracticeCandidates schedules second-half-only songs after full songs", () => {
    const candidates = generatePracticeCandidates(
        [makeDate(
            { name: "Alice Example", availability: parseAvailability("oui") },
            { name: "Bea Example", availability: parseAvailability("deuxième moitié") },
        )],
        [makeSong("second-half", ["bea"]), makeSong("full", ["alice"])],
        [makeMember("alice", "Alice Example"), makeMember("bea", "Bea Example")],
        "12:00",
        "13:00",
        30,
        0,
        "one",
    );

    assert.deepEqual(candidates[0]?.songs.map(({ songId, startTime }) => [songId, startTime]), [
        ["full", "12:00"],
        ["second-half", "12:30"],
    ]);
});

test("generatePracticeCandidates records an available substitute for forgiven missing staff", () => {
    const candidates = generatePracticeCandidates(
        [makeDate(
            { name: "Alice Example", availability: parseAvailability("non") },
            { name: "Bea Example", availability: parseAvailability("oui") },
        )],
        [{ ...makeSong("song", ["alice"]), staffInstruments: { alice: "Guitar" } }],
        [makeMember("alice", "Alice Example"), makeMember("bea", "Bea Example", "Drums", ["Guitar"])],
        "12:00",
        "12:30",
        30,
        1,
    );

    assert.deepEqual(candidates[0]?.songs[0]?.replacementStaff, ["Bea Example (Guitar)"]);
    assert.deepEqual(candidates[0]?.songs[0]?.missingStaff, ["Alice Example (Guitar)"]);
});

test("generatePracticeCandidates schedules forgiven missing staff when no substitute is available", () => {
    const date = makeDate({ name: "Alice Example", availability: parseAvailability("non") });
    const song = { ...makeSong("song", ["alice"]), staffInstruments: { alice: "Guitar" } };
    const members = [makeMember("alice", "Alice Example")];

    const forgiven = generatePracticeCandidates([date], [song], members, "12:00", "12:30", 30, 1);
    const notForgiven = generatePracticeCandidates([date], [song], members, "12:00", "12:30", 30, 0);

    assert.equal(forgiven[0]?.songs[0]?.fullStaff, false);
    assert.deepEqual(forgiven[0]?.songs[0]?.replacementStaff, []);
    assert.deepEqual(forgiven[0]?.songs[0]?.missingStaff, ["Alice Example (Guitar)"]);
    assert.deepEqual(notForgiven, []);
});

test("generatePracticeCandidates reports songs that do not fit in the available slot", () => {
    const candidates = generatePracticeCandidates(
        [makeDate()],
        [makeSong("one"), makeSong("two"), makeSong("three")],
        [],
        "12:00",
        "13:00",
        30,
        0,
    );

    assert.deepEqual(candidates[0]?.songs.map(({ songId }) => songId), ["one", "two"]);
    assert.deepEqual(candidates[0]?.overflowSongs, ["three"]);
});

test("generatePracticeCandidates rejects invalid slots and dates without schedulable songs", () => {
    const date = makeDate();
    const song = makeSong("song");

    assert.deepEqual(generatePracticeCandidates([date], [song], [], "13:00", "12:00", 30, 0), []);
    assert.deepEqual(generatePracticeCandidates([date], [song], [], "12:00", "13:00", 0, 0), []);
    assert.deepEqual(generatePracticeCandidates([date], [makeSong("chant", ["singer"])], [makeMember("singer", "Singer", "Chant")], "12:00", "13:00", 30, 0), []);
});

test("generatePracticeCandidates only requires singers for chant-necessary songs when enabled", () => {
    const date = makeDate({ name: "Singer", availability: parseAvailability("non") });
    const members = [makeMember("singer", "Singer", "Chant")];
    const chantNecessarySong = { ...makeSong("chant-necessary", ["singer"]), chantNecessaire: true };

    const allowed = generatePracticeCandidates([date], [chantNecessarySong], members, "12:00", "12:30", 30, 1);
    const required = generatePracticeCandidates([date], [chantNecessarySong], members, "12:00", "12:30", 30, 1, undefined, true);

    assert.equal(allowed[0]?.songs[0]?.fullStaff, false);
    assert.deepEqual(required, []);
});

test("generatePracticeCandidates defers a replaceable partial song to its full-staff half", () => {
    const candidates = generatePracticeCandidates(
        [makeDate(
            { name: "Second Half Member", availability: parseAvailability("deuxième moitié") },
            { name: "Substitute", availability: parseAvailability("oui") },
        )],
        [{ ...makeSong("deferred", ["second"]), staffInstruments: { second: "Guitar" } }],
        [makeMember("second", "Second Half Member"), makeMember("sub", "Substitute", "Drums", ["Guitar"])],
        "12:00",
        "13:00",
        30,
        1,
    );

    assert.deepEqual(candidates[0]?.songs.map(({ songId, startTime, fullStaff }) => [songId, startTime, fullStaff]), [
        ["deferred", "12:30", true],
    ]);
});

test("generatePracticeCandidates ranks deferred, complete, and partial songs in the second half", () => {
    const members = [
        makeMember("blocker", "Blocker"),
        makeMember("deferred", "Deferred Member"),
        makeMember("deferred-sub", "Deferred Substitute", "Drums", ["Guitar"]),
        makeMember("full", "Full Member"),
        makeMember("partial-one", "Partial One"),
        makeMember("partial-two", "Partial Two"),
        makeMember("sub-one", "Substitute One", "Drums", ["Guitar"]),
        makeMember("sub-two", "Substitute Two", "Drums", ["Guitar"]),
    ];
    const date = makeDate(
        { name: "Blocker", availability: parseAvailability("oui") },
        { name: "Deferred Member", availability: parseAvailability("deuxième moitié") },
        { name: "Deferred Substitute", availability: parseAvailability("oui") },
        { name: "Full Member", availability: parseAvailability("oui") },
        { name: "Partial One", availability: parseAvailability("non") },
        { name: "Partial Two", availability: parseAvailability("non") },
        { name: "Substitute One", availability: parseAvailability("oui") },
        { name: "Substitute Two", availability: parseAvailability("oui") },
    );
    const songs = [
        makeSong("blocker", ["blocker"]),
        { ...makeSong("deferred", ["deferred"]), staffInstruments: { deferred: "Guitar" } },
        makeSong("full", ["full"]),
        { ...makeSong("partial-one", ["partial-one"]), staffInstruments: { "partial-one": "Guitar" } },
        {
            ...makeSong("partial-two", ["partial-one", "partial-two"]),
            staffInstruments: { "partial-one": "Guitar", "partial-two": "Guitar" },
        },
    ];

    const candidates = generatePracticeCandidates([date], songs, members, "12:00", "13:00", 30, 2, "blocker");

    assert.deepEqual(candidates[0]?.songs.map(({ songId, startTime }) => [songId, startTime]), [
        ["blocker", "12:00"],
        ["deferred", "12:30"],
    ]);
});

test("generatePracticeCandidates prioritizes requested song and second-half-only songs", () => {
    const members = [
        makeMember("first", "First Member"),
        makeMember("second", "Second Member"),
    ];
    const candidates = generatePracticeCandidates(
        [makeDate(
            { name: "First Member", availability: parseAvailability("oui") },
            { name: "Second Member", availability: parseAvailability("deuxième moitié") },
        )],
        [makeSong("full-first", ["first"]), makeSong("requested", ["first"]), makeSong("second-only", ["second"])],
        members,
        "12:00",
        "13:00",
        30,
        0,
        "requested",
    );

    assert.deepEqual(candidates[0]?.songs.map(({ songId, startTime }) => [songId, startTime]), [
        ["requested", "12:00"],
        ["second-only", "12:30"],
    ]);
});

test("generatePracticeCandidates counts optional staff, workload, and overflow", () => {
    const candidates = generatePracticeCandidates(
        [makeDate(
            { name: "Guitarist", availability: parseAvailability("oui") },
            { name: "Available Back", availability: parseAvailability("oui") },
            { name: "Absent Back", availability: parseAvailability("non") },
        )],
        [
            { ...makeSong("one", ["guitar", "backs", "absent"]), staffInstruments: { backs: "Backs", absent: "Aux Percs" } },
            makeSong("two", ["guitar"]),
            makeSong("overflow"),
        ],
        [
            makeMember("guitar", "Guitarist"),
            makeMember("backs", "Available Back", "Backs"),
            makeMember("absent", "Absent Back", "Aux Percs"),
        ],
        "12:00",
        "13:00",
        30,
        0,
        "one",
    );

    assert.deepEqual(candidates[0]?.songs.find(({ songId }) => songId === "one")?.missingStaff, ["Absent Back (Aux Percs, optionnel)"]);
    assert.equal(candidates[0]?.optionalStaffCount, 1);
    assert.deepEqual(candidates[0]?.workload, { guitar: 2, backs: 1, absent: 1 });
    assert.deepEqual(candidates[0]?.staffWorkload, { Guitarist: 2, "Available Back": 1 });
    assert.deepEqual(candidates[0]?.overflowSongs, ["overflow"]);
});

test("generatePracticeCandidates rejects excess absences and duplicate substitute use", () => {
    const date = makeDate(
        { name: "First Missing", availability: parseAvailability("non") },
        { name: "Second Missing", availability: parseAvailability("non") },
        { name: "Only Substitute", availability: parseAvailability("oui") },
    );
    const members = [
        makeMember("first", "First Missing"),
        makeMember("second", "Second Missing"),
        makeMember("sub", "Only Substitute", "Drums", ["Guitar"]),
    ];
    const song = {
        ...makeSong("song", ["first", "second"]),
        staffInstruments: { first: "Guitar", second: "Guitar" },
    };

    assert.deepEqual(generatePracticeCandidates([date], [song], members, "12:00", "12:30", 30, 2), []);
    assert.deepEqual(generatePracticeCandidates([date], [song], members, "12:00", "12:30", 30, 1), []);
});

test("generatePracticeCandidates defaults missing readiness to zero", () => {
    const candidates = generatePracticeCandidates(
        [makeDate()],
        [
            { ...makeSong("default-readiness"), readiness: undefined },
            makeSong("ready", [], 5),
        ],
        [],
        "12:00",
        "13:00",
        30,
        0,
    );

    assert.deepEqual(candidates[0]?.songs.map(({ songId, readiness }) => [songId, readiness]), [
        ["default-readiness", 0],
        ["ready", 5],
    ]);
    assert.equal(candidates[0]?.readinessPriority, 195);

    const reversedCandidates = generatePracticeCandidates(
        [makeDate()],
        [makeSong("ready", [], 5), { ...makeSong("default-readiness"), readiness: undefined }],
        [],
        "12:00",
        "13:00",
        30,
        0,
    );
    assert.deepEqual(reversedCandidates[0]?.songs.map(({ songId }) => songId), ["default-readiness", "ready"]);
});

test("generatePracticeCandidates handles absent staff records and instrument lists", () => {
    const missingMember = generatePracticeCandidates(
        [makeDate()],
        [makeSong("missing-member", ["ghost"])],
        [],
        "12:00",
        "12:30",
        30,
        0,
    );
    const noInstrumentList = generatePracticeCandidates(
        [makeDate({ name: "Original", availability: parseAvailability("non") })],
        [{ ...makeSong("no-substitute", ["original"]), staffInstruments: { original: "Guitar" } }],
        [makeMember("original", "Original"), { memberId: "sub", name: "No Instrument List", actif: true }],
        "12:00",
        "12:30",
        30,
        1,
    );

    assert.deepEqual(missingMember, []);
    assert.equal(noInstrumentList[0]?.songs[0]?.songId, "no-substitute");
    assert.deepEqual(noInstrumentList[0]?.songs[0]?.replacementStaff, []);
    assert.deepEqual(noInstrumentList[0]?.songs[0]?.missingStaff, ["Original (Guitar)"]);
});

test("sortCandidates prioritizes candidates with complete songs", () => {
    const candidate = (date: string, fullSongCount: number): PracticeCandidate => ({
        date,
        event: "Practice",
        startTime: "12:00",
        endTime: "13:00",
        songs: [],
        overflowSongs: [],
        workload: {},
        staffWorkload: {},
        fullSongCount,
        forgivenSongCount: 0,
        optionalStaffCount: 0,
        readinessPriority: 0,
    });
    const nearest = candidate("2026-10-16", 0);
    const complete = candidate("2026-10-24", 1);

    assert.deepEqual(sortCandidates([nearest, complete], "nearest", "2026-10-15"), [complete, nearest]);
});

test("sortCandidates supports songs mode, workload tie-breaks, and default preferred date", () => {
    const candidate = (date: string, overrides: Partial<PracticeCandidate> = {}): PracticeCandidate => ({
        date,
        event: "Practice",
        startTime: "12:00",
        endTime: "13:00",
        songs: [],
        overflowSongs: [],
        workload: {},
        staffWorkload: {},
        fullSongCount: 0,
        forgivenSongCount: 0,
        optionalStaffCount: 0,
        readinessPriority: 0,
        ...overrides,
    });
    const lessWork = candidate("2026-10-15", { songs: [makeScheduledSong("one", "12:00")] });
    const moreWork = candidate("2026-10-16", {
        songs: [makeScheduledSong("one", "12:00")],
        workload: { guitarist: 2 },
    });
    const moreSongs = candidate("2026-10-17", { songs: [makeScheduledSong("one", "12:00"), makeScheduledSong("two", "12:30")] });

    assert.deepEqual(sortCandidates([lessWork, moreWork, moreSongs], "songs", "2026-10-15", false), [moreSongs, moreWork, lessWork]);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const toIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const todayCandidate = candidate(toIsoDate(today));
    const tomorrowCandidate = candidate(toIsoDate(tomorrow));
    assert.deepEqual(sortCandidates([tomorrowCandidate, todayCandidate], "nearest"), [todayCandidate, tomorrowCandidate]);

    const tiedBefore = candidate("2026-10-14");
    const tiedAfter = candidate("2026-10-16");
    assert.deepEqual(sortCandidates([tiedAfter, tiedBefore], "nearest", "2026-10-15"), [tiedBefore, tiedAfter]);
});