import { useState } from "react";

function PasteForm() {
  const [content, setContent] = useState("");
  const [expiration, setExpiration] = useState("");
  const [accessLimit, setAccessLimit] = useState(1);
  const [showCopyNotification, setShowCopyNotification] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      content,
      expirationTime: expiration ? `${expiration}T23:59:59` : null,
      accessLimit: accessLimit,
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
        alert("Failed to create paste. Please try again.");
      }
    } catch (error) {
      console.error("Error creating paste:", error);
      alert("An error occurred while creating the paste.");
    }
  };

  const handleCopy = (link) => {
    navigator.clipboard.writeText(link);
    setShowCopyNotification(true);

    // Automatically hide the notification after 1 minute
    setTimeout(() => {
      setShowCopyNotification(false);
    }, 60000); // 1 minute
  };

  return (
    <div className="max-w-lg mx-auto mt-10 bg-gradient-to-b from-white to-blue-50 p-8 shadow-lg rounded-md">
      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label htmlFor="content" className="block text-gray-700 font-medium mb-2">
            Snippet Content
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter your code or text here..."
            required
            className="w-full h-32 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-5">
          <label htmlFor="expiration" className="block text-gray-700 font-medium mb-2">
            Expiration Date (optional)
          </label>
          <input
            type="date"
            id="expiration"
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-5">
          <label htmlFor="accessLimit" className="block text-gray-700 font-medium mb-2">
            Access Limit
          </label>
          <input
            type="number"
            id="accessLimit"
            value={accessLimit}
            onChange={(e) => setAccessLimit(e.target.value)}
            min="1"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-2 px-4 rounded-md hover:shadow-lg hover:from-blue-700 hover:to-blue-600 transition-all duration-300"
        >
          Create Snippet
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

export default PasteForm;
