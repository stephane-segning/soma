# Glossary

**Class**  
A shared learning space (formerly called “Space”).

**Topic**  
A node in the class tree. Can contain content and sub-topics.

**Document**  
The editable content attached to a topic.

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
A signed token granting permissions in a class.

**MembershipCapability**  
Grants a peer access to a class.

**IssuerCapability**  
Delegates authority from a teacher to a bot.

**Bot**  
A read-only class member that caches and serves content.

**Relay**  
A connectivity service that forwards encrypted traffic.

**Rendezvous**  
A discovery service helping peers find each other.

**Mailbox**  
A bot-backed queue for delivering approvals asynchronously.

**Tapia**  
Typing-speed companion app.
