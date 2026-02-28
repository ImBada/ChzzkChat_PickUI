import BaseDisplayApp from '../shared/BaseDisplayApp'
import PickedMessageRetro from './components/PickedMessageRetro'

export default function RetroApp() {
    return <BaseDisplayApp MessageComponent={PickedMessageRetro} />
}
