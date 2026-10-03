import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAvailablePracticeSongs, getRestrictedStaffUnavailableForSong, getStaffWorkloadKey, minutesToTime, timeToMinutes, type PracticeCandidate, type PracticeScheduleSource, type ScheduledSong } from "./practiceScheduling";

function PracticeSchedule() {
    const navigate = useNavigate();
    const [schedule, setSchedule] = useState<PracticeCandidate | null>(() => {
        try { return JSON.parse(sessionStorage.getItem("polyjam-practice-schedule") ?? "null") as PracticeCandidate | null; } catch { return null; }
    });
    const [startTime, setStartTime] = useState(schedule?.startTime ?? "18:00");
    const [endTime, setEndTime] = useState(schedule?.endTime ?? "20:00");
    const [source] = useState<PracticeScheduleSource | null>(() => {
        try { return JSON.parse(sessionStorage.getItem("polyjam-practice-source") ?? "null") as PracticeScheduleSource | null; } catch { return null; }
    });
    const [songToAdd, setSongToAdd] = useState("");
    const [staffCopyStatus, setStaffCopyStatus] = useState("");
    const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
    const [dropTargetSongId, setDropTargetSongId] = useState<string | null>(null);

    useEffect(() => {
        if (!schedule) navigate("/pratique", { replace: true });
    }, [navigate, schedule]);

    if (!schedule) return null;
    const currentSchedule = schedule;
    const addableSongs = source
        ? getAvailablePracticeSongs(source, currentSchedule.songs, currentSchedule.startTime, currentSchedule.endTime, currentSchedule.excludedSongIds)
        : [];
    const compiledStaff = [...new Set(currentSchedule.songs.flatMap((song) => song.availableStaff.map((staff) => {
        const name = getStaffWorkloadKey(staff).trim();
        const nameParts = name.split(/\s+/);
        return nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : name;
    })))];

    async function copyStaffList() {
        try {
            await navigator.clipboard.writeText(compiledStaff.join("\n"));
            setStaffCopyStatus("Liste du staff copiée.");
        } catch {
            setStaffCopyStatus("Impossible de copier la liste du staff.");
        }
    }

    function saveSongs(songs: ScheduledSong[], current: PracticeCandidate, excludedSongIds = current.excludedSongIds ?? []) {
        let cursor = timeToMinutes(startTime);
        const scheduleEnd = timeToMinutes(endTime);
        const scheduledSongs: ScheduledSong[] = [];
        const overflowSongs = [...current.overflowSongs];
        songs.forEach((song) => {
            if (cursor + song.durationMinutes > scheduleEnd) {
                overflowSongs.push(song.title);
                return;
            }
            scheduledSongs.push({ ...song, startTime: minutesToTime(cursor) });
            cursor += song.durationMinutes;
        });
        const staffWorkload: Record<string, number> = {};
        scheduledSongs.forEach((song) => song.availableStaff.forEach((name) => {
            staffWorkload[name] = (staffWorkload[name] ?? 0) + 1;
        }));
        const workload: Record<string, number> = {};
        if (source) {
            scheduledSongs.forEach((song) => source.setlistSongs.find((item) => item.songId === song.songId)?.staffMemberIds.forEach((memberId) => {
                workload[memberId] = (workload[memberId] ?? 0) + 1;
            }));
        }
        const updated = {
            ...current,
            startTime,
            endTime,
            songs: scheduledSongs,
            excludedSongIds,
            staffWorkload,
            workload: source ? workload : current.workload,
            fullSongCount: scheduledSongs.filter((song) => song.fullStaff).length,
            forgivenSongCount: scheduledSongs.filter((song) => !song.fullStaff).length,
            overflowSongs: [...new Set(overflowSongs)].filter((title) => !scheduledSongs.some((song) => song.title === title)),
        };
        setSchedule(updated);
        sessionStorage.setItem("polyjam-practice-schedule", JSON.stringify(updated));
        return updated;
    }

    function removeSong(songId: string) {
        saveSongs(
            currentSchedule.songs.filter((song) => song.songId !== songId),
            currentSchedule,
            (currentSchedule.excludedSongIds ?? []).filter((excludedSongId) => excludedSongId !== songId),
        );
    }

    function addSong() {
        const selectedSong = addableSongs.find((song) => song.songId === songToAdd);
        if (!selectedSong) return;
        saveSongs([...currentSchedule.songs, selectedSong], currentSchedule);
        setSongToAdd("");
    }

    function updateSchedule() {
        const songs = [...currentSchedule.songs];
        if (source) {
            currentSchedule.overflowSongs.forEach((title) => {
                const restoredSong = getAvailablePracticeSongs(source, songs, startTime, endTime, currentSchedule.excludedSongIds)
                    .find((song) => song.title === title);
                if (restoredSong) songs.push(restoredSong);
            });
        }
        saveSongs(songs, currentSchedule);
    }

    function updateSongDuration(songId: string, durationMinutes: number) {
        if (!Number.isFinite(durationMinutes) || durationMinutes < 1) return;
        setSchedule((current) => {
            if (!current) return current;
            const songs = current.songs.map((song) => song.songId === songId ? { ...song, durationMinutes } : song);
            const totalDuration = songs.reduce((total, song) => total + song.durationMinutes, 0);
            if (totalDuration > timeToMinutes(endTime) - timeToMinutes(startTime)) return current;
            let cursor = timeToMinutes(startTime);
            const scheduledSongs = songs.map((song) => {
                const updatedSong = { ...song, startTime: minutesToTime(cursor) };
                cursor += song.durationMinutes;
                return updatedSong;
            });
            const updated = { ...current, songs: scheduledSongs };
            sessionStorage.setItem("polyjam-practice-schedule", JSON.stringify(updated));
            return updated;
        });
    }

    function reorderSongs(songId: string, targetSongId: string, insertAfter: boolean) {
        const index = currentSchedule.songs.findIndex((song) => song.songId === songId);
        const targetIndex = currentSchedule.songs.findIndex((song) => song.songId === targetSongId);
        if (index < 0 || targetIndex < 0 || songId === targetSongId) return;
        const songs = [...currentSchedule.songs];
        const [movedSong] = songs.splice(index, 1);
        let insertIndex = targetIndex + (insertAfter ? 1 : 0);
        if (index < insertIndex) insertIndex -= 1;
        songs.splice(insertIndex, 0, movedSong);

        let cursor = timeToMinutes(startTime);
        const proposedStart = songs.slice(0, insertIndex).reduce((time, song) => time + song.durationMinutes, cursor);
        if (source) {
            const unavailableStaff = getRestrictedStaffUnavailableForSong(
                source,
                songId,
                minutesToTime(proposedStart),
                movedSong.durationMinutes,
                startTime,
                endTime,
            );
            if (unavailableStaff.length > 0 && !window.confirm(
                `${unavailableStaff.join(", ")} ${unavailableStaff.length === 1 ? "n'est pas disponible" : "ne sont pas disponibles"} pendant cette partie de la pratique. Déplacer quand même ${movedSong.title} ?`,
            )) return;
        }

        const updated = { ...currentSchedule, songs: songs.map((song) => {
            const updatedSong = { ...song, startTime: minutesToTime(cursor) };
            cursor += song.durationMinutes;
            return updatedSong;
        }) };
        setSchedule(updated);
        sessionStorage.setItem("polyjam-practice-schedule", JSON.stringify(updated));
    }

    function handleSongDrop(event: React.DragEvent<HTMLTableRowElement>, targetSongId: string) {
        event.preventDefault();
        const songId = event.dataTransfer.getData("text/plain") || draggedSongId;
        if (!songId) return;
        const rowBounds = event.currentTarget.getBoundingClientRect();
        reorderSongs(songId, targetSongId, event.clientY > rowBounds.top + rowBounds.height / 2);
        setDraggedSongId(null);
        setDropTargetSongId(null);
    }

    function downloadImage() {
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 220 + currentSchedule.songs.length * 90;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#202124";
        context.font = "bold 34px Arial";
        context.fillText(`Pratique - ${currentSchedule.date}`, 50, 60);
        context.font = "22px Arial";
        context.fillText(`${currentSchedule.startTime} - ${currentSchedule.endTime}`, 50, 105);
        context.font = "bold 16px Arial";
        context.fillText("Début", 50, 155);
        context.fillText("Chanson", 180, 155);
        context.fillText("Show Ready (%)", 450, 155);
        context.fillText("Artiste", 560, 155);
        context.fillText("Staff disponible", 700, 155);
        context.fillText("Staff absent", 1040, 155);
        currentSchedule.songs.forEach((song, index) => {
            const y = 195 + index * 90;
            context.font = "17px Arial";
            drawWrappedText(context, song.startTime, 50, y, 100, 22);
            drawWrappedText(context, song.title, 180, y, 260, 22);
            drawWrappedText(context, `${song.readiness}%`, 450, y, 100, 22);
            drawWrappedText(context, song.artist, 560, y, 130, 22);
            drawWrappedText(context, song.availableStaff.join(", ") || "Aucun", 700, y, 320, 22);
            drawWrappedText(context, song.missingStaff.join(", ") || "-", 1040, y, 130, 22);
        });
        const link = document.createElement("a");
        link.download = `pratique-${currentSchedule.date}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }

    return (
        <div className="drive-document practice-schedule-page">
            <div className="drive-breadcrumb"><Link to="/">Accueil</Link><b>›</b><Link to="/pratique">Pratique</Link><b>›</b><span>Horaire</span></div>
            <div className="document-heading"><div><h1>Horaire de pratique</h1></div></div>
            <div className="schedule-editor-controls">
                <div><label htmlFor="schedule-date">Date</label><input id="schedule-date" type="date" value={currentSchedule.date} onChange={(event) => setSchedule({ ...currentSchedule, date: event.target.value })} /></div>
                <div><label htmlFor="schedule-start">Début</label><input id="schedule-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
                <div><label htmlFor="schedule-end">Fin</label><input id="schedule-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div>
                <button className="member-save-button" type="button" onClick={updateSchedule}>Recalculer</button>
                <button className="primary-action" type="button" onClick={downloadImage}>Générer l'image</button>
                <button className="member-save-button" type="button" onClick={copyStaffList} disabled={compiledStaff.length === 0}>Copier la liste du staff</button>
            </div>
            {staffCopyStatus && <p className="status-message" role="status" aria-live="polite">{staffCopyStatus}</p>}
            <div className="practice-table-wrap"><table className="practice-table"><thead><tr><th>Début</th><th>Durée</th><th>Chanson</th><th>Show Ready (%)</th><th>Staff disponible</th><th>Staff absent</th><th>Actions</th></tr></thead><tbody>{currentSchedule.songs.map((song) => <tr key={song.songId} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", song.songId); setDraggedSongId(song.songId); }} onDragEnd={() => { setDraggedSongId(null); setDropTargetSongId(null); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTargetSongId(song.songId); }} onDrop={(event) => handleSongDrop(event, song.songId)} className={`${draggedSongId === song.songId ? "is-dragging " : ""}${dropTargetSongId === song.songId && draggedSongId !== song.songId ? "is-drop-target" : ""}`} title="Glisser pour réorganiser"><td>{song.startTime}</td><td><input className="schedule-song-duration" type="number" min="1" max="240" value={song.durationMinutes} onChange={(event) => updateSongDuration(song.songId, Number(event.target.value))} /> min</td><td>{song.title}</td><td>{song.readiness}%</td><td>{song.availableStaff.join(", ") || "Aucun"}</td><td>{song.missingStaff.join(", ") || "-"}</td><td><button className="schedule-order-button" type="button" onClick={() => removeSong(song.songId)} aria-label={`Retirer ${song.title}`} title="Retirer la chanson">×</button></td></tr>)}</tbody></table></div>
            {source && <div className="schedule-add-song"><label htmlFor="schedule-add-song-select">Ajouter une chanson disponible</label><select id="schedule-add-song-select" value={songToAdd} onChange={(event) => setSongToAdd(event.target.value)} disabled={addableSongs.length === 0}><option value="">{addableSongs.length ? "Choisir une chanson" : "Aucune autre chanson disponible"}</option>{addableSongs.map((song) => <option key={song.songId} value={song.songId}>{song.title} - {song.artist}</option>)}</select><button className="member-save-button" type="button" onClick={addSong} disabled={!songToAdd}>Ajouter</button></div>}
            {currentSchedule.overflowSongs.length > 0 && <p className="members-error">Chansons non incluses : {currentSchedule.overflowSongs.map((title) => { const song = source?.setlistSongs.find((item) => item.title === title); return `${title} (${song?.readiness ?? 0}%)`; }).join(", ")}</p>}
        </div>
    );
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(" ");
    let line = "";
    let lineIndex = 0;
    words.forEach((word) => {
        const nextLine = line ? `${line} ${word}` : word;
        if (context.measureText(nextLine).width > maxWidth && line) {
            context.fillText(line, x, y + lineIndex * lineHeight);
            line = word;
            lineIndex += 1;
        } else {
            line = nextLine;
        }
    });
    if (line) context.fillText(line, x, y + lineIndex * lineHeight);
}

export default PracticeSchedule;
