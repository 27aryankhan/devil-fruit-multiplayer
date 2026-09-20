# AI AGENTS & DEVELOPER GUIDELINES

## CRITICAL: PERMANENT LEADERBOARD DATA PRESERVATION

> [!IMPORTANT]
> **NEVER CLEAR, DELETE, RESET, OR OVERWRITE `leaderboard.json` OR ANY PLAYER NAMES FROM THE HALL OF SLAYERS LEADERBOARD.**
> Real players actively play this game and their names and high scores are permanently preserved.

### Rules:
1. **Zero Data Loss**: In any future changes, refactoring, feature additions, or bug fixes, `leaderboard.json` must remain intact.
2. **Never Commit an Empty Leaderboard**: Do not commit empty arrays `{"classic": [], "zen": []}` or reset stats.
3. **Preserve Player Names & Personal Bests**: When players submit new scores, the system updates their personal best without ever removing or dropping any player from the leaderboard.
4. **Resilient Backups**: The server maintains `leaderboard.json.bak` and uses atomic writes (`leaderboard.json.tmp`) to ensure zero corruption across restarts or process termination.
