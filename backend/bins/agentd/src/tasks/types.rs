#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackgroundTaskKind {
    ExplainSelection,
    ExpandSelection,
    ResearchSelection,
}

impl BackgroundTaskKind {
    pub fn from_i32(value: i32) -> Option<Self> {
        match value {
            1 => Some(Self::ExplainSelection),
            2 => Some(Self::ExpandSelection),
            3 => Some(Self::ResearchSelection),
            _ => None,
        }
    }

    pub fn as_i32(self) -> i32 {
        match self {
            Self::ExplainSelection => 1,
            Self::ExpandSelection => 2,
            Self::ResearchSelection => 3,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackgroundTaskStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
}

impl BackgroundTaskStatus {
    pub fn from_i32(value: i32) -> Option<Self> {
        match value {
            1 => Some(Self::Queued),
            2 => Some(Self::Running),
            3 => Some(Self::Succeeded),
            4 => Some(Self::Failed),
            _ => None,
        }
    }

    pub fn as_i32(self) -> i32 {
        match self {
            Self::Queued => 1,
            Self::Running => 2,
            Self::Succeeded => 3,
            Self::Failed => 4,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BackgroundTaskRecord {
    pub task_id: String,
    pub kind: BackgroundTaskKind,
    pub status: BackgroundTaskStatus,
    pub space_id: String,
    pub document_id: String,
    pub selection_text: String,
    pub persist_in_document: bool,
    pub result_text: Option<String>,
    pub error: Option<String>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}
