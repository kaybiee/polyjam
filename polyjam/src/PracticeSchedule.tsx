import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { minutesToTime, timeToMinutes, type PracticeCandidate } from "./practiceScheduling";

function PracticeSchedule() {
    const navigate = useNavigate();
    const [schedule, setSchedule] = useState<PracticeCandidate | null>(() => {
        try { return JSON.parse(sessionStorage.getItem("polyjam-practice-schedule") ?? "null") as PracticeCandidate | null; } catch { return null; }
    });
    const [startTime, setStartTime] = useState(schedule?.startTime ?? "18:00");
    const [endTime, setEndTime] = useState(schedule?.endTime ?? "20:00");

    useEffect(() => {
        if (!schedule) navigate("/pratique", { replace: true });
    }, [navigate, schedule]);

    if (!schedule) return null;
    const currentSchedule = schedule;

    function updateSchedule() {
        let cursor = timeToMinutes(startTime);
        const updated = {
            ...currentSchedule,
            startTime,
            endTime,
            songs: currentSchedule.songs.map((song) => {
                const updatedSong = { ...song, startTime: minutesToTime(cursor) };
                cursor += song.durationMinutes;
                return updatedSong;
            }),
        };
        setSchedule(updated);
        sessionStorage.setItem("polyjam-practice-schedule", JSON.stringify(updated));
    }

    function updateSongDuration(songId: string, durationMinutes: number) {
        if (!Number.isFinite(durationMinutes) || durationMinutes < 1) return;
        setSchedule((current) => {
            if (!current) return current;
            let cursor = timeToMinutes(startTime);
            const updated = {
                ...current,
                songs: current.songs.map((song) => {
                    const updatedSong = song.songId === songId ? { ...song, durationMinutes } : song;
                    const scheduledSong = { ...updatedSong, startTime: minutesToTime(cursor) };
                    cursor += updatedSong.durationMinutes;
                    return scheduledSong;
                }),
            };
            sessionStorage.setItem("polyjam-practice-schedule", JSON.stringify(updated));
            return updated;
        });
    }

    function moveSong(songId: string, direction: -1 | 1) {
        setSchedule((current) => {
            if (!current) return current;
            const index = current.songs.findIndex((song) => song.songId === songId);
            const nextIndex = index + direction;
            if (index < 0 || nextIndex < 0 || nextIndex >= current.songs.length) return current;
            const songs = [...current.songs];
            [songs[index], songs[nextIndex]] = [songs[nextIndex], songs[index]];
            let cursor = timeToMinutes(startTime);
            const updated = { ...current, songs: songs.map((song) => {
                const updatedSong = { ...song, startTime: minutesToTime(cursor) };
                cursor += song.durationMinutes;
                return updatedSong;
            }) };
            sessionStorage.setItem("polyjam-practice-schedule", JSON.stringify(updated));
            return updated;
        });
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
        context.fillText("Artiste", 450, 155);
        context.fillText("Staff disponible", 610, 155);
        context.fillText("Staff absent", 1020, 155);
        currentSchedule.songs.forEach((song, index) => {
            const y = 195 + index * 90;
            context.font = "17px Arial";
            drawWrappedText(context, song.startTime, 50, y, 100, 22);
            drawWrappedText(context, song.title, 180, y, 260, 22);
            drawWrappedText(context, song.artist, 450, y, 140, 22);
            drawWrappedText(context, song.availableStaff.join(", ") || "Aucun", 610, y, 390, 22);
            drawWrappedText(context, song.missingStaff.join(", ") || "-", 1020, y, 150, 22);
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
            </div>
            <div className="practice-table-wrap"><table className="practice-table"><thead><tr><th>Début</th><th>Durée</th><th>Chanson</th><th>Staff disponible</th><th>Staff absent</th><th>Ordre</th></tr></thead><tbody>{currentSchedule.songs.map((song, index) => <tr key={song.songId}><td>{song.startTime}</td><td><input className="schedule-song-duration" type="number" min="1" max="240" value={song.durationMinutes} onChange={(event) => updateSongDuration(song.songId, Number(event.target.value))} /> min</td><td>{song.title}</td><td>{song.availableStaff.join(", ") || "Aucun"}</td><td>{song.missingStaff.join(", ") || "-"}</td><td><button className="schedule-order-button" type="button" onClick={() => moveSong(song.songId, -1)} disabled={index === 0} aria-label="Monter">↑</button><button className="schedule-order-button" type="button" onClick={() => moveSong(song.songId, 1)} disabled={index === currentSchedule.songs.length - 1} aria-label="Descendre">↓</button></td></tr>)}</tbody></table></div>
            {currentSchedule.overflowSongs.length > 0 && <p className="members-error">Chansons non incluses : {currentSchedule.overflowSongs.join(", ")}</p>}
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
