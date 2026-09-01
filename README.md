# Personal Harness Frontend

A lightweight React frontend for interacting with the Personal Harness agent.

The frontend provides a chat-oriented interface for managing sessions, sending messages to the agent, displaying streamed model output, monitoring tool execution events, approving sensitive operations, and cancelling running agent executions.

> **Status:** MVP / active development

## Overview

The frontend acts as the user interface for the Personal Harness backend.

```text
┌──────────────────────────────────────────────┐
│              Personal Harness UI             │
│                                              │
│  ┌────────────┐  ┌────────────────────────┐  │
│  │ Sessions   │  │ Chat                   │  │
│  │            │  │                        │  │
│  │ + New      │  │ User message           │  │
│  │ Session 1  │  │ Assistant response     │  │
│  │ Session 2  │  │ Tool events            │  │
│  │ Session 3  │  │ Approval requests      │  │
│  │            │  │                        │  │
│  └────────────┘  └────────────────────────┘  │
│                                              │
│                  Input / Controls             │
└───────────────────────┬──────────────────────┘
                        │
                        │ HTTP + SSE
                        ▼
              Personal Harness Backend
```

The current frontend is implemented as a small React application with the application logic in `src/main.jsx` and styling in `src/style.css`.

## Features

* Session list
* Create new sessions
* Load session history
* Send chat messages
* Stream assistant responses
* Display tool execution events
* Display run status
* User approval UI
* Approve sensitive operations
* Reject sensitive operations
* Cancel running agent executions
* Optimistic rendering of user messages
* Automatic refresh of canonical message history after a run

## Technology Stack

* React 19
* React DOM 19
* Vite
* JavaScript
* CSS
* Fetch API
* Server-Sent Events

Current dependencies and scripts are defined in `package.json`.

## Requirements

* Node.js
* npm
* Personal Harness backend running locally

The backend is expected to run on:

```text
http://localhost:8000
```

The frontend currently uses:

```text
http://localhost:8000/api
```

as its API base URL.

## Installation

Clone the repository:

```bash
git clone https://github.com/mohammadhniksefat/personal-harness-frontend.git
cd personal-harness-frontend
```

Install dependencies:

```bash
npm install
```

## Development

Start the Vite development server:

```bash
npm run dev
```

By default, Vite serves the application at:

```text
http://localhost:5173
```

The backend currently allows CORS requests from this origin.

## Production Build

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

These are the scripts currently defined by the project.

## Project Structure

```text
personal-harness-frontend/
│
├── src/
│   ├── main.jsx
│   └── style.css
│
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── ...
```

The repository currently contains a minimal frontend structure centered around the React entry point and stylesheet.

## Application State

The application currently manages several pieces of state:

```text
sessions
sid
msgs
input
running
run
approval
events
```

These represent:

| State      | Purpose                        |
| ---------- | ------------------------------ |
| `sessions` | Available chat sessions        |
| `sid`      | Active session ID              |
| `msgs`     | Current conversation           |
| `input`    | Current user input             |
| `running`  | Whether an agent run is active |
| `run`      | Current run ID                 |
| `approval` | Pending user approval          |
| `events`   | Runtime/tool events            |

## Backend Integration

The frontend communicates with the backend through REST endpoints and an SSE stream.

### API Base URL

Currently configured in `src/main.jsx`:

```javascript
const API = 'http://localhost:8000/api';
```

### Sessions

Load sessions:

```http
GET /api/sessions
```

Create a session:

```http
POST /api/sessions
```

Load messages:

```http
GET /api/sessions/{session_id}/messages
```

### Chat

Send a message:

```http
POST /api/sessions/{session_id}/chat
```

Request body:

```json
{
  "message": "Hello"
}
```

The response is consumed as a Server-Sent Events stream.

## Streaming

The frontend reads the response body using the browser Streams API:

```text
fetch()
   │
   ▼
ReadableStream
   │
   ▼
TextDecoder
   │
   ▼
SSE event parser
   │
   ▼
Application state
```

Events are separated using the SSE convention:

```text
data: {...}

data: {...}
```

The frontend parses each event and updates the interface incrementally.

## Supported Runtime Events

The frontend currently handles events such as:

```text
run_started
assistant_delta
tool_requested
tool_started
tool_output
tool_finished
tool_failed
approval_required
run_completed
run_failed
run_cancelled
done
```

Assistant deltas are appended to the currently streaming assistant message, allowing the user to see the response as it is generated.

## Approval Flow

When the backend determines that a sensitive operation requires user approval, it emits:

```text
approval_required
```

The frontend displays:

* approval reason
* tool name
* relevant command/arguments
* Approve button
* Reject button

The selected action is sent to:

```http
POST /api/approvals/{approval_id}?action=approve
```

or:

```http
POST /api/approvals/{approval_id}?action=reject
```

## Cancellation

While a run is active, the UI exposes a cancel action.

The frontend sends:

```http
POST /api/runs/{run_id}/cancel
```

The backend then signals the active run to stop.

## Message Lifecycle

When a user sends a message:

```text
User enters prompt
       │
       ▼
Validate input
       │
       ▼
Optimistically render user message
       │
       ▼
POST /sessions/{id}/chat
       │
       ▼
Read SSE stream
       │
       ├── assistant_delta
       │       ↓
       │   Update assistant message
       │
       ├── tool events
       │       ↓
       │   Display runtime activity
       │
       ├── approval_required
       │       ↓
       │   Show approval UI
       │
       └── done
               ↓
       Reload canonical history
```

The frontend intentionally renders the user's message immediately and refreshes the canonical conversation from the backend when the run completes.

## UI Architecture

The current UI consists of three primary areas:

### Session Sidebar

Contains:

* Application title
* New session button
* Existing sessions
* Session status
* Active session selection

### Chat Area

Displays:

* User messages
* Assistant messages
* Tool-related runtime events

### Input / Control Area

Provides:

* Message input
* Send button
* Cancel button while running
* Approval controls when required

## Development Guidelines

When extending the frontend, keep the communication model simple:

```text
UI
 │
 ▼
API client / fetch
 │
 ▼
Backend
 │
 ▼
SSE events
 │
 ▼
State updates
 │
 ▼
UI
```

Prefer deriving UI state from backend events instead of attempting to predict agent behavior on the client.

In particular:

* Treat the backend as the source of truth for conversation history.
* Treat streamed events as runtime state.
* Do not fabricate tool results.
* Do not assume an action succeeded until the backend reports success.
* Keep cancellation synchronized with the active run ID.
* Handle incomplete/interrupted SSE streams gracefully.

## Current Limitations

The current frontend is intentionally minimal.

Known architectural limitations include:

* API URL is hard-coded
* No environment-based API configuration
* No authentication UI
* Minimal error handling
* No dedicated API client abstraction
* No reusable component architecture
* No Markdown rendering
* No syntax highlighting
* No rich tool cards
* No persistent client-side settings
* No reconnection strategy for interrupted SSE streams
* No explicit connection-status indicator
* No automated frontend tests
* No accessibility-focused component system
* No responsive layout guarantees documented yet

## Planned Improvements

Potential improvements include:

### UX

* Better message rendering
* Markdown support
* Code blocks and syntax highlighting
* Copy buttons
* Improved tool execution visualization
* Better approval dialogs
* Better loading states
* Empty states
* Error states
* Connection status
* Improved mobile layout
* Auto-scroll behavior
* "Scroll to latest" control

### Architecture

* Component-based UI
* Dedicated API client
* Environment-based configuration
* Centralized state management where justified
* Typed API/event contracts
* Reusable SSE client
* Better error boundaries

### Agent Observability

A richer runtime panel could display:

```text
Run
 ├── Status
 ├── Duration
 ├── Tool executions
 │    ├── Tool name
 │    ├── Arguments
 │    ├── Status
 │    └── Output
 ├── Approvals
 └── Errors
```

## Related Repository

Backend:

https://github.com/mohammadhniksefat/personal-harness-backend

## License

No license is currently specified in the repository.
