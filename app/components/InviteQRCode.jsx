import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg'; // npm install react-native-qrcode-svg

export default function InviteQRCode({ groupId }) {
  if (!groupId) {return null;}
  // Peut être un lien profond, ou le groupId seulement selon ta logique
  const inviteLink = `vigiapp://group/${groupId}`;
  return (
    <View style={{ alignItems: 'center', marginVertical: 18 }}>
      <QRCode value={inviteLink} size={160} />
    </View>
  );
}
