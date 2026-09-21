import { Modal } from 'antd';
import { RecruitmentRoster } from './RecruitmentRoster';

export const UnitShop = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => (
    <Modal open={visible} onCancel={onClose} footer={null} width={1000} className="imperial-shop" title={<span className="eyebrow">帝國徵召中心 / REINFORCEMENTS</span>}>
        <div className="shop-scroll"><RecruitmentRoster support /></div>
    </Modal>
);
