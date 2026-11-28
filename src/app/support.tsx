import { Linking } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, H1, H2, Screen } from '../components/ui';
import { PRIVACY_CONTACT } from './privacy';

/** Help and support. Also the App Store support page (app.mocktrialcentral.com/support). */
export default function Support() {
  return (
    <Screen>
      <H1>Help and support</H1>
      <Card>
        <H2>Contact us</H2>
        <Body>Questions, problems, or a result that looks wrong: email {PRIVACY_CONTACT}. We usually answer within two business days.</Body>
        <Button title="Email support" onPress={() => Linking.openURL(`mailto:${PRIVACY_CONTACT}?subject=Mock%20Trial%20Central`)} />
      </Card>
      <Card>
        <H2>Signing in</H2>
        <Body>Enter your email on the Me tab and we send you a six-digit code. No password is needed. If the code does not arrive, check your spam folder, then ask for a new one.</Body>
      </Card>
      <Card>
        <H2>Running a competition</H2>
        <Body>Anyone can set up a competition. To keep fake listings off the site, a site admin approves each organizer once; until then your competitions are visible only to you. Ask for approval on the Me tab.</Body>
      </Card>
      <Card>
        <H2>Results and ratings</H2>
        <Body>Past results come from the circuit's published results record. If a result is missing or wrong, email us with the competition and the correct finish. The Mock Trial ELO Ratings page explains every rule and links to the full data.</Body>
        <Button title="How the ratings work" kind="ghost" onPress={() => router.push('/ratings')} />
      </Card>
      <Card>
        <H2>Community rules</H2>
        <Body>Competition chat and bulletins are for running competitions. There is no tolerance for abusive, harassing, hateful or sexual content, spam, or fake competitions.</Body>
        <Body>Tap Report under any message, bulletin or competition to send it to the site admins, who review reports within 24 hours and remove content that breaks these rules. Tap Hide this person to stop seeing someone's messages and posts. People who break the rules lose access.</Body>
      </Card>
      <Card>
        <H2>Deleting your account</H2>
        <Body>Open the Me tab, tap Delete my account, and confirm. Your sign-in and personal details are removed right away.</Body>
      </Card>
      <Button title="Privacy notice" kind="ghost" onPress={() => router.push('/privacy')} />
    </Screen>
  );
}
