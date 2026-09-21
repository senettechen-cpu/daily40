
import React, { useState, useEffect } from 'react';
import { Modal, Input, Switch, Button, message } from 'antd';
import { Mail, Save } from 'lucide-react';
import { useGame } from '../contexts/GameContext';

interface VoxLinkModalProps {
    visible: boolean;
    onClose: () => void;
}

export const VoxLinkModal: React.FC<VoxLinkModalProps> = ({ visible, onClose }) => {
    const { notificationEmail, emailEnabled, updateSettings } = useGame();

    const [localEmail, setLocalEmail] = useState(notificationEmail);
    const [localEnabled, setLocalEnabled] = useState(emailEnabled);

    // Sync when modal opens or context updates
    useEffect(() => {
        if (visible) {
            setLocalEmail(notificationEmail || '');
            setLocalEnabled(emailEnabled || false);
        }
    }, [visible, notificationEmail, emailEnabled]);

    const handleSave = () => {
        updateSettings(localEmail, localEnabled);
        message.success("Vox-Link Array configured. Astropaths standing by.");
        onClose();
    };

    return (
        <Modal
            title={<span className="text-imperial-gold font-mono tracking-widest uppercase">Astropathic Vox-Link</span>}
            open={visible}
            onCancel={onClose}
            footer={null}
            className="imperial-modal"
            centered
            bodyStyle={{ backgroundColor: '#000', border: '1px solid #fbbf24' }}
            maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
        >
            <div className="flex flex-col gap-6 py-4 text-white">
                <p className="text-zinc-400 text-xs font-mono">
                    Configure your personal Astropathic frequencies to receive priority alerts from the logic engine.
                    WARNING: Unencrypted channels may be intercepted by Warp entities.
                </p>

                <div className="bg-zinc-900/50 p-4 border border-imperial-gold/20 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <span className="text-imperial-gold font-mono uppercase text-xs tracking-wider">Vox-Link Status</span>
                        <Switch
                            checked={localEnabled}
                            onChange={setLocalEnabled}
                            className="bg-zinc-700"
                            checkedChildren="ACTIVE"
                            unCheckedChildren="OFFLINE"
                        />
                    </div>

                    <div>
                        <label className="block text-imperial-gold/60 text-xs mb-2 font-mono uppercase">Target Frequency (Email)</label>
                        <Input
                            prefix={<Mail size={14} className="text-imperial-gold/50" />}
                            value={localEmail}
                            onChange={e => setLocalEmail(e.target.value)}
                            className="!bg-black !text-imperial-gold !border-imperial-gold/30 font-mono focus:!border-imperial-gold focus:!shadow-[0_0_10px_#fbbf24]"
                            placeholder="commander@terra.gov"
                        />
                    </div>
                </div>

                <div className="flex gap-4">
                    <Button
                        onClick={async () => {
                            if (!localEmail) return message.error("Please enter an email frequency first.");
                            try {
                                message.loading("Transmitting test signal...", 1);
                                // Get current token
                                const { auth } = await import('../lib/firebase');
                                const token = await auth.currentUser?.getIdToken();

                                if (!token) throw new Error("Authentication failed: No user found.");

                                await import('../services/api').then(m => m.api.sendTestEmail(localEmail, token));
                                message.success("Signal Received! Check your cogitator (Inbox).");
                            } catch (e: any) {
                                console.error("Vox-Link Error:", e);
                                // Try to extract specific error message from API
                                const errorMsg = e.message || "Unknown Error";
                                message.error(`Signal Lost: ${errorMsg}. Check logs/SMTP.`);
                            }
                        }}
                        className="flex-1 !bg-zinc-800 !text-imperial-gold !border-imperial-gold/30 hover:!bg-zinc-700 !font-mono uppercase transition-all"
                    >
                        Test Signal
                    </Button>
                    <Button
                        type="primary"
                        icon={<Save size={16} />}
                        onClick={handleSave}
                        className="flex-1 !bg-imperial-gold !text-black !font-bold !tracking-widest !h-10 hover:!bg-white border-none uppercase"
                    >
                        Establish Link
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
