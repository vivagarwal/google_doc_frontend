import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Client as Stomp } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import DiffMatchPatch from 'diff-match-patch';

const sessionId = crypto.randomUUID();

function ViewSnippet() {
  const { uniqueLink } = useParams();  // Retrieve unique link from URL
  const [snippetData, setSnippetData] = useState([]);  // Current snippet content - 2d array
  const [stompClient, setStompClient] = useState(null);  // WebSocket client
  const [isEditing, setIsEditing] = useState(false);  // Edit mode toggle
  const dmp = new DiffMatchPatch();
  const cursorRef = useRef({ line: 0, column: 0 }); // Stores cursor position persistently
  const textareaRef = useRef(null); // Reference to the textarea

  // Helper to convert snippetData (2D) -> single string
  const snippetToString = (snippet) => {
    return snippet.map(lineArr => lineArr.join("")).join("\n");
  };

  // Helper to convert single string -> snippetData (2D)
  const stringToSnippet = (text) => {
    return text.split("\n").map(line => [...line]);
  };

  // Helper to find the 1D offset in "fullText" that corresponds to (edit.lineNumber, edit.columnNumber)
  const computeOffset = (snippet, lineNumber, columnNumber) => {
    let offset = 0;
    for (let i = 0; i < lineNumber && i < snippet.length; i++) {
      offset += snippet[i].length;
      offset += 1; // for the newline
    }
    offset += columnNumber;
    return offset;
  };

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
        // Convert List<String> to 2D character array
        const formattedContent = data.content.map(line => line.split(""));
        setSnippetData(formattedContent);
      } catch (err) {
        console.error("Error fetching snippet:", err.message);
      }
    };

    fetchSnippet();
  }, [uniqueLink]);

  useEffect(() => {
    console.log("[WebSocket] Initializing WebSocket connection");
    const socket = new SockJS(`${import.meta.env.VITE_BASE_URL}/ws/edit`);
    const client = new Stomp({
      webSocketFactory: () => socket,
      connectHeaders: {
        uniqueLink: uniqueLink,  // Send the uniqueLink as a header
      },
      debug: (str) => console.log(`[STOMP Debug] ${str}`),
    });

    client.onConnect = () => {
      console.log("[WebSocket] WebSocket connected");
      setStompClient(client);

      // --------- ONLY SUBSCRIPTION LOGIC -----------
      client.subscribe(`/topic/snippets-delta/${uniqueLink}`, (message) => {
        const edit = JSON.parse(message.body);

        if (edit.sessionId === sessionId) {
          console.log("Ignoring delta from this session:", edit.contentDelta);
          return;
        }

        console.log("[RECEIVE]", edit.deleteOperation ? "Delete" : "Insert",
                    "Delta:", edit.contentDelta, "Line:", edit.lineNumber,
                    "Column:", edit.columnNumber);

        setSnippetData((prevSnippet) => {
          // Convert old snippet -> string
          const oldString = snippetToString(prevSnippet);

          // If the user has a selection, get the old cursor offset
          // Otherwise default to 0
          let oldCursorPos = 0;
          if (textareaRef.current) {
            oldCursorPos = textareaRef.current.selectionStart;
          }

          // Where does this remote edit happen (in 1D) ?
          const editOffset = computeOffset(prevSnippet, edit.lineNumber, edit.columnNumber);

          let newString;
          if (edit.deleteOperation) {
            // delete 'edit.contentDelta.length' characters starting at editOffset
            // but clamp to avoid out-of-bounds
            const deleteCount = Math.min(edit.contentDelta.length, oldString.length - editOffset);
            newString =
              oldString.slice(0, editOffset) +
              oldString.slice(editOffset + deleteCount);

            // If the edit offset is strictly before our cursor, shift cursor left
            if (editOffset < oldCursorPos) {
              let shiftAmount = deleteCount;
              // If oldCursorPos is within the deleted range, clamp it
              if (oldCursorPos < editOffset + deleteCount) {
                shiftAmount = oldCursorPos - editOffset;
              }
              oldCursorPos = Math.max(editOffset, oldCursorPos - shiftAmount);
            }
          } else {
            // insertion
            newString =
              oldString.slice(0, editOffset) +
              edit.contentDelta +
              oldString.slice(editOffset);

            // If insertion is at or before our oldCursorPos, shift cursor right
            if (editOffset <= oldCursorPos) {
              oldCursorPos += edit.contentDelta.length;
            }
          }

          // Convert new string -> snippet
          const updatedSnippet = stringToSnippet(newString);

          // Re-apply the local cursor via setSelectionRange after re-render
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.setSelectionRange(oldCursorPos, oldCursorPos);
            }
          }, 0);

          return updatedSnippet;
        });
      });
      // --------- END OF SUBSCRIPTION LOGIC CHANGES -----------
    };

    client.activate();

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
    const cursorPosStringed = e.target.selectionStart; // Capture cursor position

    let line = 0, column = cursorPosStringed;
    const lines = updatedContent.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (column <= lines[i].length) {
        line = i;
        break;
      }
      column -= lines[i].length + 1;
    }

    // Ensure column starts at 0 for new lines
    column = Math.max(0, column);
    cursorRef.current = { line, column }; // Store cursor position before updating state
    console.log(cursorRef);

    // Calculate the diff between previous and updated content
    const diffs = dmp.diff_main(snippetData.map(l => l.join("")).join("\n"), updatedContent);
    dmp.diff_cleanupSemantic(diffs);

    // We'll need the old text for newline position calculation:
    const oldText = snippetData.map(l => l.join("")).join("\n");

    let delta = '';
    let deleteOperation = false;
    let adjustedColumn = column;

    diffs.forEach(([op, text]) => {
        if (op === 1) {
            delta += text;
            if (text === "\n") {
              // SPECIAL CASE: single newline insertion
              // Recompute (line, column) from the OLD text, ignoring the new text
              // We want the position *before* the new line was added.
              // So let's treat selectionStart - 1 as the old cursor.
              let oldCursorPos = Math.max(0, e.target.selectionStart - 1);
    
              // Recompute line, col from oldText
              let oldLine = 0, oldCol = oldCursorPos;
              const oldLines = oldText.split("\n");
              for (let i = 0; i < oldLines.length; i++) {
                if (oldCol <= oldLines[i].length) {
                  oldLine = i;
                  break;
                }
                oldCol -= (oldLines[i].length + 1);
              }
              oldCol = Math.max(0, oldCol);
    
              // This is our final (line, column)
              line = oldLine;
              adjustedColumn = oldCol;
            }
            else
            {
              adjustedColumn = column - 1; // Fix insert position
            }
        } else if (op === -1) {
            delta += text;
            deleteOperation = true;
            adjustedColumn = column; // Fix delete position
            if (text === "\n") {
              line++;
            }
        }
    });

    if (delta.length > 0) {
      console.log(deleteOperation ? "[SEND DELETE]" : "[SEND INSERT]", 
                  "Delta:", delta, "Line:", line, "Column:", adjustedColumn);
      console.log("Updated content:", updatedContent);

      if (stompClient && stompClient.connected) {
        stompClient.publish({
            destination: `/app/snippets/edit-delta/${uniqueLink}`,
            body: JSON.stringify({
                contentDelta: delta,
                lineNumber: line,
                columnNumber: adjustedColumn, // Corrected column position
                sessionId: sessionId,
                deleteOperation: deleteOperation,
            }),
        });
      } else {
          console.error(`[WebSocket Error] Unable to send message OR STOMP client not connected.`);
      }
    }

    setSnippetData(updatedContent.split("\n").map(line => [...line]));
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
            <p className="whitespace-pre-wrap text-gray-800">
            {snippetData.map(line => line.join("")).join("\n")}
            </p>
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
            ref={textareaRef} // Attach ref to the textarea
            value={snippetData.map(line => line.join("")).join("\n")}
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
