import BaseDisplayApp from '../shared/BaseDisplayApp'
import PickedMessage from './components/PickedMessage'

export default function DisplayApp() {
  return <BaseDisplayApp MessageComponent={PickedMessage} />
}
