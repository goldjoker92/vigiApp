import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ReportScreen from '../screens/Report';

// --- mocks navigation/auth
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock('../hooks/useAuthGuard', () => ({
  useAuthGuard: () => ({ uid: 'user123', apelido: 'Gui', username: 'guillaume' }),
}));

// --- mocks Location
const loc = {
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 5 },
};
jest.mock('expo-location', () => loc);

// --- mocks Firestore
const addDocMock = jest.fn();
const collectionMock = jest.fn();
jest.mock('firebase/firestore', () => ({
  addDoc: (...args) => addDocMock(...args),
  collection: (...args) => collectionMock(...args),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: { fromDate: (d) => d },
}));
jest.mock('../firebase', () => ({
  db: { __tag: 'db' },
  auth: { currentUser: { uid: 'user123' } },
}));

// --- mocks reverse CEP util
const reverseMock = jest.fn();
jest.mock('@/utils/cep', () => ({
  GOOGLE_MAPS_KEY: 'DUMMY',
  resolveExactCepFromCoords: (...args) => reverseMock(...args),
}));

// helper : remplir formulaire
const fillFields = (screen) => {
  fireEvent.changeText(screen.getByPlaceholderText(/Descrição/), 'Teste descrição');
  fireEvent.changeText(screen.getByPlaceholderText(/Rua e número/), 'Rua 6 de Março, 128');
  fireEvent.changeText(screen.getByPlaceholderText(/Cidade/), 'Horizonte');
  fireEvent.changeText(screen.getByPlaceholderText(/Estado\/UF/), 'CE');
};

beforeEach(() => {
  jest.clearAllMocks();
  loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  loc.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: -4.1, longitude: -38.48 },
  });
  reverseMock.mockResolvedValue({
    cep: '62880000',
    address: { logradouro: 'Rua Teste', numero: '123', cidade: 'Horizonte', uf: 'CE' },
    candidates: [],
  });
  addDocMock.mockResolvedValue({ id: 'doc123' });
  collectionMock.mockReturnValue({ __col: 'publicAlerts' });

  global.fetch = jest
    .fn()
    // forward geocode
    .mockResolvedValueOnce({
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: { location: { lat: -4.101, lng: -38.482 } },
            address_components: [{ types: ['postal_code'], long_name: '62880000' }],
          },
        ],
      }),
    })
    // cloud function
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
});

describe('ReportScreen advanced flow', () => {
  it('active le bouton après avoir rempli les champs', async () => {
    const screen = render(<ReportScreen />);
    fillFields(screen);
    const send = screen.getByText(/Enviar alerta/i);
    await waitFor(() => expect(send.parent.props.style.backgroundColor).not.toBe('#aaa'));
  });

  it('appelle Firestore et Cloud Function au clic', async () => {
    const screen = render(<ReportScreen />);
    fillFields(screen);
    fireEvent.press(screen.getByText(/Enviar alerta/i));

    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1));
    expect(collectionMock).toHaveBeenCalledWith({ __tag: 'db' }, 'publicAlerts');

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [, cfCall] = global.fetch.mock.calls;
    expect(cfCall[0]).toMatch(/sendPublicAlertByAddress/);
    const body = JSON.parse(cfCall[1].body);
    expect(body).toMatchObject({
      cidade: 'Horizonte',
      uf: 'CE',
      radius_m: 1000,
    });
  });

  it('remplit les champs via le bouton localisation', async () => {
    const screen = render(<ReportScreen />);
    fireEvent.press(screen.getByText(/Usar minha localização atual/i));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Rua e número/i).props.value).toMatch(/Rua Teste/);
    });
  });

  it('affiche un toast si permission GPS refusée', async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    const screen = render(<ReportScreen />);
    fireEvent.press(screen.getByText(/Usar minha localização atual/i));
    await waitFor(() => expect(screen.getByText(/Permissão de localização negada/i)).toBeTruthy());
  });

  it('formate le CEP automatiquement', async () => {
    const screen = render(<ReportScreen />);
    const cepInput = screen.getByPlaceholderText(/CEP/i);
    fireEvent.changeText(cepInput, '62882574');
    fireEvent(cepInput, 'blur');
    await waitFor(() => expect(screen.getByPlaceholderText(/CEP/i).props.value).toBe('62882-574'));
  });
});
