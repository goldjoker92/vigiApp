// /components/ContactAdmin.jsx
import { HStack, Button } from "@chakra-ui/react";
export default function ContactAdmin() {
  return (
    <HStack spacing={3} mt={5}>
      <Button as="a" href="mailto:support@vigiapp.com" target="_blank" colorScheme="yellow" variant="outline">📧 Email</Button>
      <Button as="a" href="https://t.me/ton_telegram" target="_blank" colorScheme="blue" variant="outline">Telegram</Button>
      <Button as="a" href="https://wa.me/5511999999999" target="_blank" colorScheme="green" variant="outline">WhatsApp</Button>
    </HStack>
  );
}
