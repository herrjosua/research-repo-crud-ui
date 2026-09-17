// Fixed, hardcoded demo personas for the public portfolio demo. This is the
// single source of truth for seeding (server.js, guarded by DEMO_MODE), the
// allowlist demo-login validates against, and what GET /auth/demo-users
// returns to the picker UI — never derived from the database, since this is
// static configuration, not user data.
const DEMO_USERS = [
    {
        username: 'priya',
        displayName: 'Priya Patel',
        role: 'UX Researcher',
        gitName: 'Priya Patel',
        gitEmail: 'priya.demo@example.com',
    },
    {
        username: 'sam',
        displayName: 'Sam Okafor',
        role: 'Product/UX Designer',
        gitName: 'Sam Okafor',
        gitEmail: 'sam.demo@example.com',
    },
    {
        username: 'jordan',
        displayName: 'Jordan Lee',
        role: 'Research Ops Lead',
        gitName: 'Jordan Lee',
        gitEmail: 'jordan.demo@example.com',
    },
];

const DEMO_USERNAMES = new Set(DEMO_USERS.map((u) => u.username));

module.exports = { DEMO_USERS, DEMO_USERNAMES };