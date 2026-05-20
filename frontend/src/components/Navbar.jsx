import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import LocationsModal from "./LocationsModal";

export default function Navbar() {
  const location = useLocation();
  const [showLocations, setShowLocations] = useState(false);

  const link = (to, label) => (
    <Link
      to={to}
      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
        location.pathname === to
          ? "bg-blue-700 text-white"
          : "text-blue-100 hover:bg-blue-600"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <nav className="bg-blue-800 text-white px-4 py-3 flex items-center gap-4 shadow">
        <span className="font-bold text-lg tracking-wide shrink-0">Appliances 4 Less</span>
        <div className="flex gap-1">
          {link("/", "Inventory")}
          {link("/invoices", "Invoices")}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowLocations(true)}
          className="text-blue-100 hover:text-white text-sm px-3 py-1.5 rounded hover:bg-blue-700 border border-blue-600"
        >
          Locations
        </button>
      </nav>

      {showLocations && (
        <LocationsModal onClose={() => setShowLocations(false)} />
      )}
    </>
  );
}
