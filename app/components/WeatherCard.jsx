// components/WeatherCard.jsx
import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import * as Location from 'expo-location';
import Constants from 'expo-constants';

function getWeatherEmoji(main) {
  switch (main) {
    case 'Clear': return "☀️";
    case 'Clouds': return "☁️";
    case 'Rain': return "🌧️";
    case 'Drizzle': return "🌦️";
    case 'Thunderstorm': return "⛈️";
    case 'Snow': return "❄️";
    case 'Mist':
    case 'Fog': return "🌫️";
    default: return "🌡️";
  }
}

export default function WeatherCard({ cep }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  const OPENWEATHER_API_KEY = Constants.expoConfig?.extra?.OPENWEATHER_API_KEY;

  useEffect(() => {
    const fetchWeather = async () => {
      setLoading(true);
      try {
        let lat = null, lon = null, cidade = null;
        // Geoloc (si possible)
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let location = await Location.getCurrentPositionAsync({});
          lat = location.coords.latitude;
          lon = location.coords.longitude;
        }

        let weatherData = null;
        if (lat && lon) {
          // Récupère la ville pour OpenWeatherMap
          const geoResp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          const geoJson = await geoResp.json();
          cidade = geoJson.address?.city || geoJson.address?.town || geoJson.address?.village || "Fortaleza";
          const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cidade},BR&lang=pt_br&appid=${OPENWEATHER_API_KEY}&units=metric`);
          weatherData = await resp.json();
        } else if (cep) {
          // Sinon, tente par CEP
          const cepResp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
          const cepJson = await cepResp.json();
          cidade = cepJson.localidade || "Fortaleza";
          const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cidade},BR&lang=pt_br&appid=${OPENWEATHER_API_KEY}&units=metric`);
          weatherData = await resp.json();
        } else {
          // fallback
          cidade = "Fortaleza";
          const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cidade},BR&lang=pt_br&appid=${OPENWEATHER_API_KEY}&units=metric`);
          weatherData = await resp.json();
        }

        if (weatherData && weatherData.weather) {
          setWeather({
            description: weatherData.weather[0]?.description,
            temp: Math.round(weatherData.main?.temp),
            city: weatherData.name,
            main: weatherData.weather[0]?.main,
          });
        } else {
          setWeather(null);
        }
      } catch (_) {
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, [cep, OPENWEATHER_API_KEY]);

  if (loading) return (
    <View style={styles.card}><ActivityIndicator color="#00C859" /></View>
  );
  if (!weather) return (
    <View style={styles.card}><Text style={{ color: '#fff' }}>Erro ao buscar clima</Text></View>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.city}>{weather.city}</Text>
      <Text style={styles.temp}>
        {getWeatherEmoji(weather.main)} {weather.temp}ºC
      </Text>
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
