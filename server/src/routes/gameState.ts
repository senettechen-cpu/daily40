
import { Router } from 'express';
import { query } from '../db';

const router = Router();

// GET game state
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const result = await query('SELECT * FROM game_state WHERE user_id = $1', [userId]);

        let row;
        if (result.rows.length === 0) {
            // If no state exists for user, return default state (don't error out)
            row = {
                id: 'new',
                resources: { rp: 0, glory: 0 },
                corruption: 0,
                current_month: 0,
                is_penitent_mode: false,
                army_strength: { reserves: { guardsmen: 0, spaceMarines: 0, custodes: 0, dreadnought: 0, baneblade: 0 }, garrisons: {}, totalActivePower: 0 },
                sector_history: {},
                owned_units: [],
                notification_email: '',
                email_enabled: false
            };
        } else {
            row = result.rows[0];
        }
        // CamelCase conversion
        const gameState = {
            id: row.id,
            resources: row.resources,
            corruption: row.corruption,
            currentMonth: row.current_month,
            isPenitentMode: row.is_penitent_mode,
            armyStrength: row.army_strength,
            sectorHistory: row.sector_history,
            ownedUnits: row.owned_units,
            notificationEmail: row.notification_email,
            emailEnabled: row.email_enabled,
            astartes: row.astartes,
            campaign: row.campaign,
            lastCorruptionTick: row.last_corruption_tick
        };
        res.json(gameState);
    } catch (err) {
        console.error('Error fetching game state:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST update game state. Since 2026-09-27 only the Vox-Link notification
// settings are written here: the legacy economy (RP and glory, corruption,
// months and sectors, army strength, the old campaign and the old ascension)
// was retired by the user, and an old page sending those fields can no longer
// write them. The first save creates the row with the settings in it (it used
// to create the row without them).
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const state = req.body ?? {};
        const email = typeof state.notificationEmail === 'string' ? state.notificationEmail : undefined;
        const enabled = typeof state.emailEnabled === 'boolean' ? state.emailEnabled : undefined;
        if (email === undefined && enabled === undefined) return res.json({ message: 'Nothing to sync' });

        const check = await query('SELECT id FROM game_state WHERE user_id = $1', [userId]);
        if (check.rows.length === 0) {
            await query(
                'INSERT INTO game_state (id, user_id, notification_email, email_enabled) VALUES ($1, $2, $3, $4)',
                [userId, userId, email ?? '', enabled ?? false],
            );
            return res.json({ message: 'Game state created' });
        }
        const fields: string[] = [];
        const values: unknown[] = [];
        if (email !== undefined) { values.push(email); fields.push(`notification_email = $${values.length}`); }
        if (enabled !== undefined) { values.push(enabled); fields.push(`email_enabled = $${values.length}`); }
        values.push(userId);
        await query(`UPDATE game_state SET ${fields.join(', ')} WHERE user_id = $${values.length}`, values);
        res.json({ message: 'Game state synced' });
    } catch (err) {
        console.error('Error syncing game state:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
