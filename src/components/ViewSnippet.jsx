import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Client as Stomp } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

function ViewSnippet() {
  const { uniqueLink } = useParams();  // Retrieve unique link from URL
  const [snippetData, setSnippetData] = useState("");  // Current snippet content
  const [stompClient, setStompClient] = useState(null);  // WebSocket client
  const [isEditing, setIsEditing] = useState(false);  // Edit mode toggle

  // Fetch snippet content from the server initially
  useEffect(() => {
    const fetchSnippet = async () => {
      try {
        const baseUrl = import.meta.env.VITE_BASE_URL;
        const res = await fetch(`${baseUrl}/api/snippets/view/${uniqueLink}`);

        if (!res.ok) {
          throw new Error("Failed to fetch the snippet.");
        }

        const data = await res.json();
        setSnippetData(data.content);
      } catch (err) {
        console.error("Error fetching snippet:", err.message);
      }
    };

    fetchSnippet();
  }, [uniqueLink]);

  // WebSocket setup and cleanup
  useEffect(() => {
    console.log("[WebSocket] Initializing WebSocket connection");
    const socket = new SockJS(`${import.meta.env.VITE_BASE_URL}/ws/edit`);
    const client = new Stomp({
      webSocketFactory: () => socket,
      debug: (str) => console.log(`[STOMP Debug] ${str}`),
    });

    client.onConnect = () => {
      console.log("[WebSocket] WebSocket connected");
      setStompClient(client);  // Set the connected client here

      // Subscribe to the topic and log incoming messages
      client.subscribe(`/topic/snippets/${uniqueLink}`, (message) => {
        const newContent = message.body;
        setSnippetData(newContent || "");  // Update with real-time changes
      });
    };

    client.activate();  // Activates the WebSocket connection

    return () => {
      console.log("[WebSocket] Disconnecting WebSocket");
      client.deactivate();
    };
  }, [uniqueLink]);

  // Toggle edit mode
  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  // Handle content change and broadcast the updates
  const handleContentChange = (e) => {
    const updatedContent = e.target.value;
    setSnippetData(updatedContent);

    if (stompClient && stompClient.connected) {
      stompClient.publish({
        destination: `/app/snippets/edit/${uniqueLink}`,
        body: updatedContent,
      });
    } else {
      console.error(`[WebSocket Error] Unable to send message. STOMP client not connected.`);
    }
  };

  // **Save updated snippet to the backend**
  const handleSaveSnippet = async () => {
    try {
      const baseUrl = import.meta.env.VITE_BASE_URL;
      const response = await fetch(`${baseUrl}/api/snippets/update/${uniqueLink}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: snippetData }),
      });

      if (!response.ok) {
        throw new Error("Failed to save the snippet.");
      }

      console.log("Snippet saved successfully.");
      setIsEditing(false);  // Exit editing mode
    } catch (err) {
      console.error("Error saving snippet:", err.message);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white p-8 shadow-lg rounded-md">
      <h2 className="text-3xl font-bold text-blue-700 mb-4">Snippet Editor</h2>

      {!isEditing ? (
        <>
          <div className="bg-gray-100 p-4 rounded-md overflow-auto">
            <p className="whitespace-pre-wrap text-gray-800">{snippetData}</p>
          </div>
          <button
            onClick={handleEditToggle}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Edit Snippet
          </button>
        </>
      ) : (
        <>
          <textarea
            value={snippetData}
            onChange={handleContentChange}
            className="w-full h-40 p-3 border border-gray-300 rounded-md"
            placeholder="Edit your snippet here..."
          />
          <button
            onClick={handleSaveSnippet}  // Save on click
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
          >
            Save and Exit Editing
          </button>
        </>
      )}
    </div>
  );
}

export default ViewSnippet;
