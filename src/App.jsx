import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PasteForm from "./components/PasteForm";
import ViewSnippet from "./components/ViewSnippet";

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-100 to-purple-200 flex items-center justify-center py-10">
      <div className="max-w-4xl w-full bg-white shadow-lg rounded-xl p-6 md:p-10">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-700 mb-2">Pastebin</h1>
          <p className="text-gray-600">Create and share code snippets easily</p>
        </header>

        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PasteForm />} />
            <Route path="/view/:uniqueLink" element={<ViewSnippet />} />
          </Routes>
        </BrowserRouter>
      </div>
    </div>
  );
}

export default App;
