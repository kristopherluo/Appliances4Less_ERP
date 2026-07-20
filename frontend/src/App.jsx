import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StoreProvider } from "./context/StoreContext";
import Inventory from "./pages/Inventory";
import InvoiceList from "./pages/InvoiceList";
import NewInvoice from "./pages/NewInvoice";
import Navbar from "./components/Navbar";

function Layout({ children, wide }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className={`${wide ? "max-w-screen-2xl" : "max-w-7xl"} mx-auto px-4 py-6`}>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Routes>
          <Route path="/" element={<Layout wide><Inventory /></Layout>} />
          <Route path="/invoices" element={<Layout wide><InvoiceList /></Layout>} />
          <Route path="/invoices/new" element={<Layout><NewInvoice /></Layout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </StoreProvider>
    </BrowserRouter>
  );
}
