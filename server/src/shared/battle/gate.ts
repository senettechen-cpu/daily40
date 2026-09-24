// v1.5 G1 (decisions §5): a new operation needs at least one committed daily
// core completed that day. Continuing an existing battle, training, the armoury
// and the records are never locked, so this gate only guards *starting* one.
// A rest day or an explicit exemption opens the gate but pays nothing.

export interface GateInput {
    /** Committed cores already completed today. */
    completedCores: number;
    /** A day set aside in advance (S2), at most two per week. */
    restDay: boolean;
    /** An explicit exemption for illness, care or an emergency (E1). */
    exempt: boolean;
}

export interface GateResult {
    allowed: boolean;
    /** False on a rest day or exemption: the operation runs but earns no requisition. */
    paysRequisition: boolean;
    reason: string;
}

export function operationGate(input: GateInput): GateResult {
    if (input.completedCores > 0) {
        return { allowed: true, paysRequisition: true, reason: '今日核心已完成，可以出戰。' };
    }
    if (input.restDay) {
        return { allowed: true, paysRequisition: false, reason: '今天是預定休息日：可以出戰，但不發軍需。' };
    }
    if (input.exempt) {
        return { allowed: true, paysRequisition: false, reason: '今天已登記豁免：可以出戰，但不發軍需。' };
    }
    return { allowed: false, paysRequisition: false, reason: '今天還沒完成任何今日核心，無法開始新的行動。' };
}
