import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Permit, INITIAL_HANDOVER_CHECKLIST, INITIAL_PART_A, INITIAL_PART_B, INITIAL_RECEIVER_CHECKLIST } from '../types';
import { savePermit } from '../services/storage';
import { generateId } from '../utils/id';

const NewPermitRoute: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const permit: Permit = {
            id: generateId(),
            permitNumber: '',
            itwocxNumber: '',
            permitType: location.state?.permitType || 'BG',
            status: 'draft',
            isDraft: true,
            createdAt: new Date().toISOString(),
            issuedDate: '',
            commencementDate: '',
            endDate: '',
            location: '',
            revealModelLayer: false,
            subLayers: false,
            ebaConstructionLayer: false,
            asBuiltLayers: false,
            scopeOfWorks: '',
            excavationType: 'mechanical',
            knownServicesScanned: null,
            servicesMarked: null,
            potholingMarkers: null,
            transpowerDesignation: null,
            watercareWorksOver: null,
            partAChecklist: [...INITIAL_PART_A],
            partAPotholingMethod: '',
            partAFrequency: '',
            partAOverheadProtection: '',
            partACloseApproach: {
                overheadElectricityDist: '',
                overheadRailDist: '',
                overheadOtherDist: '',
                undergroundElectricityDist: '',
                undergroundFibreDist: '',
                undergroundGasDist: '',
                undergroundWaterDist: '',
                permitsObtained: null
            },
            partBChecklist: [...INITIAL_PART_B],
            partBHighRiskOptions: { power11kv: false, gasHighPressure: false, mainFibre: false },
            receiverChecklist: [...INITIAL_RECEIVER_CHECKLIST],
            handoverChecklist: [...INITIAL_HANDOVER_CHECKLIST],
            dailyLogs: [],
            handoverLogs: [],
            crewMembers: [],
            otherNotes: '',
            photos: []
        };

        try {
            savePermit(permit);
        } catch (e) {
            console.error('Failed to initialise new permit:', e);
        }
        navigate(`/permit/${permit.id}`, { replace: true });
    }, [location.state, navigate]);

    return null;
};

export default NewPermitRoute;
