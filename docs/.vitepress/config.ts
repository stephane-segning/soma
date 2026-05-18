import {type DefaultTheme} from 'vitepress';
import {withMermaid} from "vitepress-plugin-mermaid";
import {withPwa} from '@vite-pwa/vitepress'
import type {PreRenderedAsset} from "rollup";

const nav: DefaultTheme.NavItem[] = [
    {text: 'Overview', link: '/00-overview'},
    {text: 'V2 Clarity', link: '/02-v2'},
    {text: 'Getting Started', link: '/getting-started/'},
    {text: 'Architecture', link: '/architecture/arc42/03-context'},
    {text: 'Development', link: '/development/dependencies'},
    {text: 'Security', link: '/security/threat-model'},
];

const sidebar: DefaultTheme.Sidebar = {
    '/': [
        {text: 'Home', link: '/'},
        {text: 'Overview', link: '/00-overview'},
        {text: 'Glossary', link: '/01-glossary'},
        {text: 'V2 Clarity Plan', link: '/02-v2'},
        {text: 'Space Authorization Model', link: '/space-authorization-model'},
    ],
    '/getting-started/': [
        {
            text: 'Getting Started',
            items: [{text: 'Setup', link: '/getting-started/'}],
        },
    ],
    '/architecture/': [
        {
            text: 'Architecture',
            items: [
                {text: 'End-to-End Flows', link: '/architecture/e2e-flows'},
                {text: 'libp2p Primer', link: '/architecture/libp2p-primer'},
                {text: 'Peer Connectivity', link: '/architecture/peer-connectivity'},
                {text: 'Infrastructure Services', link: '/architecture/infra-services'},
                {text: 'Space Membership', link: '/architecture/space-membership'},
                {text: 'Blobs (VDF)', link: '/architecture/blobs-vdfs'},
                {text: 'Packaging & Deployment', link: '/architecture/deployment'},
                {text: 'Traits', link: '/architecture/traits'},
                {text: 'Shared Contracts', link: '/architecture/shared-contracts'},
                {text: 'Repo Split Readiness', link: '/architecture/split-readiness'},
            ],
        },
        {
            text: 'ADRs',
            items: [
                {text: 'ADR-0001: Local Daemon gRPC', link: '/architecture/adrs/0001-local-daemon-grpc'},
                {text: 'ADR-0002: Capabilities & Membership', link: '/architecture/adrs/0002-capabilities-membership'},
                {text: 'ADR-0003: Bots as Cache', link: '/architecture/adrs/0003-bots-as-cache'},
                {text: 'ADR-0004: VDFs Crate', link: '/architecture/adrs/0004-vdfs-crate'},
            ],
        },
        {
            text: 'arc42',
            items: [
                {text: '01 Introduction & Goals', link: '/architecture/arc42/01-introduction-goals'},
                {text: '02 Constraints', link: '/architecture/arc42/02-constraints'},
                {text: '03 Context & Scope', link: '/architecture/arc42/03-context'},
                {text: '04 Solution Strategy', link: '/architecture/arc42/04-solution-strategy'},
                {text: '05 Building Block View', link: '/architecture/arc42/05-building-block-view'},
                {text: '06 Runtime View', link: '/architecture/arc42/06-runtime-view'},
                {text: '07 Deployment View', link: '/architecture/arc42/07-deployment-view'},
                {text: '08 Crosscutting Concepts', link: '/architecture/arc42/08-crosscutting'},
                {text: '09 Architecture Decisions', link: '/architecture/arc42/09-architecture-decisions'},
                {text: '10 Quality Requirements', link: '/architecture/arc42/10-quality-requirements'},
                {text: '11 Risks & Technical Debt', link: '/architecture/arc42/11-risks-tech-debt'},
                {text: '12 Glossary', link: '/architecture/arc42/12-glossary'},
            ],
        },
    ],
    '/development/': [
        {
            text: 'Development',
            items: [
                {text: 'Dependencies', link: '/development/dependencies'},
                {text: 'Desktop config', link: '/development/desktop-config'},
                {text: 'Protos & Codegen', link: '/development/protos'},
                {text: 'Database & Migrations', link: '/development/database'},
                {text: 'Telemetry & Logging', link: '/development/telemetry-logging'},
                {text: 'xtask', link: '/development/xtask'},
                {text: 'justfile', link: '/development/justfile'},
                {text: 'Peer Events', link: '/development/peer-events'},
                {text: 'Local LLMs (agentd models)', link: '/development/agentd-models'},
                {text: 'Desktop React DB', link: '/development/desktop-react-db'},
                {text: 'UI Components', link: '/development/ui-components'},
                {text: 'UI Framework Candidates', link: '/development/ui-framework-candidates'},
            ],
        },
    ],
    '/archive/': [
        {
            text: 'Archive',
            items: [
                {text: 'Backend Refactor Notes', link: '/archive/backend-refactor-notes'},
                {text: 'Tauri Commands', link: '/archive/tauri-commands'},
            ],
        },
    ],
    '/security/': [
        {
            text: 'Security',
            items: [
                {text: 'Threat Model', link: '/security/threat-model'},
                {text: 'SBOM', link: '/security/sbom'},
            ],
        },
    ],
};

export default withPwa(withMermaid({
    lang: 'en-US',
    title: 'Soma',
    titleTemplate: 'Soma',
    description: 'A local-first structured note-taking workspace platform',
    base: '/',
    srcDir: 'src',
    outDir: '../site',
    cleanUrls: true,
    lastUpdated: true,
    markdown: {
        lineNumbers: true,
    },
    themeConfig: {
        logo: '/icon.png',
        nav,
        sidebar,
        search: {
            provider: 'local',
        },
        outline: 'deep',
    },
    pwa: {
        outDir: '../../site',
    }
}));
