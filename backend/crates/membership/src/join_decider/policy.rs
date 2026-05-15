#[derive(Clone, Copy)]
pub struct JoinPolicy {
    pub allow_auto_with_delegation: bool,
}

impl JoinPolicy {
    pub fn bot_auto() -> Self {
        Self {
            allow_auto_with_delegation: true,
        }
    }

    pub fn manual_only() -> Self {
        Self {
            allow_auto_with_delegation: false,
        }
    }
}
