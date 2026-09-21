import { Router } from 'express';
import { query } from '../db';

const router = Router();

// POST claim legacy data
router.post('/claim', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Check if user already has data (to prevent double-claiming or overwriting)
        // For simple MVP: if user has NO tasks and NO projects, we allow claim.
        const tasksCheck = await query('SELECT 1 FROM tasks WHERE user_id = $1 LIMIT 1', [userId]);
        const projectsCheck = await query('SELECT 1 FROM projects WHERE user_id = $1 LIMIT 1', [userId]);

        if (tasksCheck.rows.length > 0 || projectsCheck.rows.length > 0) {
            return res.status(400).json({ message: 'User already has data. Cannot claim legacy data.' });
        }

        // Claim logic: Update rows where user_id IS NULL
        // Note: This takes ALL unowned rows. If this is a shared server with multiple legacy users not logged in, this is risky.
        // But assuming single-tenant upgrading to multi-tenant:

        await query('BEGIN');

        const tasksResult = await query('UPDATE tasks SET user_id = $1 WHERE user_id IS NULL', [userId]);
        const projectsResult = await query('UPDATE projects SET user_id = $1 WHERE user_id IS NULL', [userId]);

        // For game_state, it's tricky because 'global' id is hardcoded.
        // We probably want to copy the 'global' state to this user if they don't have one.
        const globalState = await query('SELECT * FROM game_state WHERE id = $1', ['global']);
        if (globalState.rows.length > 0) {
            const gs = globalState.rows[0];
            // Create new state for user based on global (or just take ownership if we retire global?)
            // Let's CLONE it.
            await query(
                'INSERT INTO game_state (id, user_id, resources, corruption, current_month, is_penitent_mode, army_strength, sector_history, owned_units) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                [userId, userId, gs.resources, gs.corruption, gs.current_month, gs.is_penitent_mode, gs.army_strength, gs.sector_history, gs.owned_units]
            );
        }

        await query('COMMIT');

        res.json({
            message: 'Legacy data claimed successfully',
            stats: {
                tasks: tasksResult.rowCount,
                projects: projectsResult.rowCount
            }
        });

    } catch (err) {
        await query('ROLLBACK');
        console.error('Error claiming data:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
