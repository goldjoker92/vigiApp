import React, { useState } from 'react';
import { View, Text, Platform, Button } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function TestPickerScreen() {
  const [show, setShow] = useState(false);
  const [date, setDate] = useState(new Date());

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#16181c',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Button title="Choisir date + heure" onPress={() => setShow(true)} />
      {show && (
        <DateTimePicker
          value={date}
          mode="datetime"
          is24Hour={true}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(e, d) => {
            if (d) {
              setDate(new Date(d));
              console.log('[Picker] Selected:', new Date(d).toISOString());
            }
            if (Platform.OS !== 'ios') {setShow(false);} // Sur iOS c'est inline, sur Android ça ferme
          }}
        />
      )}
      <Text style={{ color: '#fff', marginTop: 24, fontSize: 18 }}>
        Valeur : {date.toLocaleString()}
      </Text>
    </View>
  );
}
