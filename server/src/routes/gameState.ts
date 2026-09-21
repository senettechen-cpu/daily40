
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

// POST/PUT update game state (Sync)
// In a real app we might update specific fields, but for this sync logic 
// we'll accept a partial object and merge it, or overwrite key fields.
router.post('/', async (req, res) => {
    try {
        const state = req.body;
        console.log(`[Sync] Received state update for user ${req.user?.uid}`);
        if (state.astartes) console.log(`[Sync] Astartes data present:`, JSON.stringify(state.astartes).substring(0, 100) + '...');

        // We update all tracked fields if they are present in the payload
        const fields = [];
        const values = [];
        let idx = 1;

        if (state.resources) { fields.push(`resources = $${idx++}`); values.push(state.resources); }
        if (state.corruption !== undefined) { fields.push(`corruption = $${idx++}`); values.push(state.corruption); }
        if (state.currentMonth !== undefined) { fields.push(`current_month = $${idx++}`); values.push(state.currentMonth); }
        if (state.isPenitentMode !== undefined) { fields.push(`is_penitent_mode = $${idx++}`); values.push(state.isPenitentMode); }
        if (state.armyStrength) { fields.push(`army_strength = $${idx++}`); values.push(state.armyStrength); }
        if (state.sectorHistory) { fields.push(`sector_history = $${idx++}`); values.push(state.sectorHistory); }
        if (state.ownedUnits) { fields.push(`owned_units = $${idx++}`); values.push(state.ownedUnits); }
        if (state.notificationEmail !== undefined) { fields.push(`notification_email = $${idx++}`); values.push(state.notificationEmail); }
        if (state.emailEnabled !== undefined) { fields.push(`email_enabled = $${idx++}`); values.push(state.emailEnabled); }
        if (state.astartes) { fields.push(`astartes = $${idx++}`); values.push(state.astartes); }
        if (state.campaign) { fields.push(`campaign = $${idx++}`); values.push(state.campaign); }
        if (state.lastCorruptionTick !== undefined) { fields.push(`last_corruption_tick = $${idx++}`); values.push(state.lastCorruptionTick); }

        if (fields.length === 0) return res.status(400).json({ message: 'No data to sync' });

        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // Check if row exists first
        const check = await query('SELECT id FROM game_state WHERE user_id = $1', [userId]);

        if (check.rows.length === 0) {
            // Create new row
            const newId = userId; // or uuid
            // Construct insert
            // ... simplified for now, assuming frontend sends full state or we merge manually. 
            // Actually, for MVP let's just INSERT default + updates.
            // But the sync logic above builds a dynamic UPDATE.

            // Strategy: If not exists, INSERT. If exists, UPDATE.
            // Since the dynamic update logic is complex, let's handle the INSERT case simply:
            await query(
                'INSERT INTO game_state (id, user_id, resources, corruption, current_month, is_penitent_mode, army_strength, sector_history, owned_units, astartes, campaign) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                [userId, userId, state.resources || {}, state.corruption || 0, state.currentMonth || 0, state.isPenitentMode || false, state.armyStrength || {}, state.sectorHistory || {}, state.ownedUnits || [], state.astartes || {}, state.campaign || {}]
            );
            return res.json({ message: 'Game state created' });
        }

        values.push(userId);
        const sql = `UPDATE game_state SET ${fields.join(', ')} WHERE user_id = $${idx}`;
        await query(sql, values);
        res.json({ message: 'Game state synced' });
    } catch (err) {
        console.error('Error syncing game state:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
