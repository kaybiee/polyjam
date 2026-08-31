import { Routes, Route, Link } from "react-router-dom";
import Dispo from "./Disponibilites";




export default function App() {
  return (
    <div>
      <div>
      <h1>Home</h1>
      <Link to="/dispo">Go to Dispos</Link>
    </div>
      </div>
  );
}