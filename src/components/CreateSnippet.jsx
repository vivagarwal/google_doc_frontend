import { useState } from "react";

function CreateSnippet() {
  const [content, setContent] = useState("");
  const [showCopyNotification, setShowCopyNotification] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Initial CRDT content setup
    // Convert content into a 2D array format for line-column representation
    const crdtContent = content.split("\n").map((line, lineIndex) => 
      line.split("").map((char, columnIndex) => ({
          value: char,
          uniqueId: `${Date.now()}_${lineIndex}_${columnIndex}`, // Unique identifier
          lineNumber: lineIndex,
          columnNumber: columnIndex, 
      }))
  );

    const payload = {
      content: crdtContent.flat()
    };

    const baseUrl = import.meta.env.VITE_BASE_URL;
    const frontendUrl = window.location.origin;

    try {
      const res = await fetch(`${baseUrl}/api/snippets/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        const frontendLink = `${frontendUrl}/view/${result.uniqueLink}`;
        handleCopy(frontendLink);
      } else {
        alert("Failed to create doc. Please try again.");
      }
    } catch (error) {
      console.error("Error creating doc:", error);
      alert("An error occurred while creating the doc.");
    }
  };

  const handleCopy = (link) => {
    navigator.clipboard.writeText(link);
    setShowCopyNotification(true);

    setTimeout(() => {
      setShowCopyNotification(false);
    }, 60000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-10 bg-gradient-to-b from-white to-blue-50 p-8 shadow-lg rounded-md">
      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label htmlFor="content" className="block text-gray-700 font-medium mb-2">
            Collab Doc
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter your code or text here..."
            required
            className="w-[100%] h-[70vh] p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-2 px-4 rounded-md hover:shadow-lg hover:from-blue-700 hover:to-blue-600 transition-all duration-300"
        >
          Create CollabDoc
        </button>
      </form>

      {showCopyNotification && (
        <div className="mt-6 bg-green-100 p-4 rounded-md shadow-md transition-all">
          <p className="text-green-800 font-semibold">Link copied to clipboard successfully!</p>
        </div>
      )}
    </div>
  );
}

export default CreateSnippet;
