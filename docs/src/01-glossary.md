# Glossary

**Space**  
A shared collaboration unit containing documents, members, and resources.

**Workspace**  
Product-level term for a private collaboration group; currently modeled by spaces and their associated content, members, and permissions.

**Topic**  
A node in the space tree. Can contain content and sub-topics.

**Document**  
The editable content attached to a topic.

**Page**  
The main navigable note or document unit inside a workspace.

**Blob**  
An attachment (PDF, image, etc.), content-addressed by hash.

**Daemon**  
The local backend process handling networking, storage, and permissions.

**soma-daemon**  
The desktop peer/daemon binary (libp2p peer + local Unix socket API; no Axum).

**soma-botd**  
The server peer/bot binary (libp2p peer + Axum control plane + metrics).

**soma-relayd**  
The relay service binary (libp2p Circuit Relay + Axum + metrics).

**soma-rendezvousd**  
The rendezvous service binary (libp2p Rendezvous discovery + Axum + metrics).

**soma-bffd**  
The LLM BFF service binary (Axum + metrics; the only backend not using libp2p).

**soma-agentd**  
An optional desktop-only companion process for local automation / helpers; does not own the peer identity.

**PeerId**  
Cryptographic identity of a device.

**Capability**  
A signed token granting permissions in a space.

**Model Feature Hint**  
Local desktop metadata describing whether an AI model is suitable for chat, embedding, tool use, or image work. These hints do not grant any space permissions.

**MembershipCapability**  
Grants a peer access to a space.

**Role**  
The human-facing access level inside a space, such as Owner, Editor, Viewer, Member, or Bot.

**IssuerCapability**  
Delegates authority from an owner to a bot or trusted member.

**Bot**  
A non-human space member that can cache content, serve content, organize resources, or run approved automation depending on its granted capabilities.

**Delegated Approver**  
A peer that has been explicitly delegated authority to approve memberships for a space. A delegated approver may be a bot, but bot membership alone does not grant this authority.

**Relay**  
A connectivity service that forwards encrypted traffic.

**Rendezvous**  
A discovery service helping peers find each other.

**Mailbox**  
A bot-backed queue for delivering approvals asynchronously.

**Tapia**  
Focused training companion app for typing drills, tap-touch, exams, and similar small IT-training tasks.

**Soma**  
The main structured note-taking and workspace application in the platform.
