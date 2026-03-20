pub mod space {
    pub mod v1 {
        tonic::include_proto!("space.v1");
    }
}

pub mod daemon {
    pub mod v1 {
        tonic::include_proto!("daemon.v1");
    }
}

pub mod agent {
    pub mod v1 {
        tonic::include_proto!("agent.v1");
    }
}
