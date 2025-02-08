import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Client as Stomp } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import DiffMatchPatch from 'diff-match-patch';

const sessionId = crypto.randomUUID();

function ViewSnippet() {
  const { uniqueLink } = useParams();  // Retrieve unique link from URL
  const [snippetData, setSnippetData] = useState("");  // Current snippet content
  const [stompClient, setStompClient] = useState(null);  // WebSocket client
  const [isEditing, setIsEditing] = useState(false);  // Edit mode toggle
  const dmp = new DiffMatchPatch();

  // Fetch snippet content from the server initially
  useEffect(() => {
    console.log("Backend URL in production line 1:", import.meta.env.VITE_BASE_URL);
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
      client.subscribe(`/topic/snippets-delta/${uniqueLink}`, (message) => {
        const edit = JSON.parse(message.body);

        if (edit.sessionId === sessionId) {
          console.log("Ignoring delta from this session:", edit.contentDelta);
          return;
        }

        console.log("[RECEIVE]", edit.deleteOperation ? "Delete" : "Insert", "Delta:", edit.contentDelta, "Position:", edit.cursorPosition);
        setSnippetData((snippetData) => {
          console.log("Previous content:", snippetData);
          let updatedContent;
          if (edit.deleteOperation) {
            // Handle deletion by removing characters starting from cursorPosition
            updatedContent = [
              snippetData.slice(0, edit.cursorPosition),
              snippetData.slice(edit.cursorPosition + edit.contentDelta.length)
            ].join('');
            console.log("New content after deletion:", updatedContent);
          }else{
          updatedContent = [
            snippetData.slice(0, edit.cursorPosition),
            edit.contentDelta,
            snippetData.slice(edit.cursorPosition)
          ].join('');
          console.log("New content after inserting delta:", updatedContent);
        }
          return updatedContent;
        });
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
    const currentCursorPosition = e.target.selectionStart;

    // Calculate the diff between previous and updated content
    const diffs = dmp.diff_main(snippetData, updatedContent);
    dmp.diff_cleanupSemantic(diffs);

    // Extract the actual inserted delta
    let delta = '';
    let deleteOperation = false;
    diffs.forEach(([op, text]) => {
      if (op === 1) {  // Insert operation
        delta += text;
      }else if(op == -1){
        delta+=text;
        deleteOperation=true;
      }
      });

      if (delta.length > 0) {
        console.log(deleteOperation ? "[SEND DELETE]" : "[SEND INSERT]", "Delta:", delta, "Position:", currentCursorPosition);
        console.log("Updated content:", updatedContent);
        
        if (stompClient && stompClient.connected) {
          stompClient.publish({
            destination: `/app/snippets/edit-delta/${uniqueLink}`,
            body: JSON.stringify({
              contentDelta: delta,
              cursorPosition: currentCursorPosition,
              sessionId: sessionId,
              deleteOperation: deleteOperation,
            }),
          });
        }else {
          console.error(`[WebSocket Error] Unable to send message. STOMP client not connected.`);
      }
    } 
    setSnippetData(updatedContent);
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