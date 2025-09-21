import { useServerStatus, usePersistentQueue } from '@/hooks/useServerStatus';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

// ...

const UseCase = ({ db, chatId, user, input, setInput, Toast }) => {
  const isOnline = useServerStatus({ url: 'https://api.ton-backend.com/ping' });

  const flushAction = async (msg) => {
    // Ici, c'est l'envoi réel du message à Firebase/Firestore
    // (à adapter à ton code d’envoi réel)
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      ...msg,
      createdAt: serverTimestamp(),
    });
  };

  const enqueue = usePersistentQueue({ isOnline, onFlush: flushAction });

  // Dans ta fonction d'envoi de message :
  const handleSend = async () => {
    if (!input.trim() || !user) {
      return;
    }
    const msg = {
      text: input.trim(),
      senderId: user.uid,
      senderApelido: user.apelido || user.displayName || 'Você',
      system: false,
    };
    setInput('');
    if (isOnline) {
      await flushAction(msg);
    } else {
      enqueue(msg);
      // Optionnel : Affiche une info/badge "en attente d'envoi"
      Toast.show({
        type: 'info',
        text1: 'Mensagem salva offline',
        text2: 'Será enviada quando a conexão voltar.',
      });
    }
  };

  // Example render logic with a button to use handleSend
  return (
    <div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Digite sua mensagem"
      />
      <button onClick={handleSend}>Enviar</button>
    </div>
  );
};

export default UseCase;
