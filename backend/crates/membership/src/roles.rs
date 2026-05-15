use soma_proto_build::space::SpaceRole;

pub fn parse_role_str(role: &str) -> Option<SpaceRole> {
    match role.to_lowercase().as_str() {
        "owner" => Some(SpaceRole::Owner),
        "editor" => Some(SpaceRole::Editor),
        "viewer" => Some(SpaceRole::Viewer),
        "bot" => Some(SpaceRole::Bot),
        "member" => Some(SpaceRole::Member),
        _ => None,
    }
}

pub fn role_to_str(role: SpaceRole) -> &'static str {
    match role {
        SpaceRole::Owner => "owner",
        SpaceRole::Editor => "editor",
        SpaceRole::Viewer => "viewer",
        SpaceRole::Member => "member",
        SpaceRole::Bot => "bot",
        SpaceRole::Unspecified => "unspecified",
    }
}
