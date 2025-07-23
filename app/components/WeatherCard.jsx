// components/WeatherCard.jsx
import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

export default function WeatherCard({ cep }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cep) return;
    // Exemple : recherche la météo à Fortaleza si pas de cep localisé
    const fetchWeather = async () => {
      setLoading(true);
      try {
        // Récupère la ville à partir du CEP
        const cepResp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const cepJson = await cepResp.json();
        const cidade = cepJson.localidade || "Desconhecida";
        // Récupère la météo de la ville
        const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cidade},BR&lang=pt_br&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
        const json = await resp.json();
        setWeather({
          description: json.weather[0]?.description,
          temp: Math.round(json.main?.temp),
          city: cidade,
        });
      } catch (_) {
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, [cep]);

  if (loading) return (
    <View style={styles.card}><ActivityIndicator color="#00C859" /></View>
  );
  if (!weather) return (
    <View style={styles.card}><Text style={{ color: '#fff' }}>Erro ao buscar clima</Text></View>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.city}>{weather.city}</Text>
      <Text style={styles.temp}>{weather.temp}ºC</Text>
      <Text style={styles.desc}>{weather.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: '#24262e', borderRadius: 16, padding: 18, marginBottom: 14, alignItems: 'flex-start' },
  city: { color: '#ffe568', fontWeight: 'bold', fontSize: 17, marginBottom: 5 },
  temp: { color: '#fff', fontWeight: 'bold', fontSize: 29, marginBottom: 4 },
  desc: { color: '#bbb', fontSize: 16 }
});
