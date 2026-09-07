import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { budgetApi, progressApi } from '../api';
import { extractError } from '../api/client';
import { Button, Card, EmptyState, ErrorText, Input, Screen, WarningBanner } from '../components/ui';
import { enqueue } from '../offline/queue';
import { colors } from '../theme';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function pickPhoto(fromCamera) {
  const permission = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true });
  if (result.canceled) return null;
  return result.assets.map((asset, i) => ({
    uri: asset.uri,
    name: asset.fileName || `foto-${Date.now()}-${i}.jpg`,
    type: asset.mimeType || 'image/jpeg',
  }));
}

// Reusa el mismo endpoint que "Avance por Ítem" en la web (GET .../budget, ver ProgressPage.jsx):
// esta pantalla SOLO registra avance sobre ítems ya existentes, nunca carga ni edita presupuesto.
export default function RegisterProgressScreen({ route }) {
  const { projectId } = route.params;
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await budgetApi.get(projectId);
      setItems(data.items || []);
    } catch (err) {
      setLoadError(extractError(err));
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.description?.toLowerCase().includes(q));
  }, [items, search]);

  if (selectedItem) {
    return <ProgressForm projectId={projectId} item={selectedItem} onBack={() => setSelectedItem(null)} />;
  }

  return (
    <Screen>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 15, color: colors.muted, marginBottom: 10 }}>Elige el ítem del presupuesto sobre el que vas a registrar avance</Text>
        <Input placeholder="Buscar ítem..." value={search} onChangeText={setSearch} />
      </View>
      <ErrorText>{loadError}</ErrorText>
      <FlatList
        data={filteredItems}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0, flexGrow: 1 }}
        ListEmptyComponent={items ? <EmptyState>Este proyecto todavía no tiene ítems de presupuesto cargados.</EmptyState> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedItem(item)}
            style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{item.description}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
              {Number(item.quantity)} {item.unit} · ejecutado {item.accumulatedQty} ({item.percent}%)
            </Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

function ProgressForm({ projectId, item, onBack }) {
  const [date, setDate] = useState(todayIso());
  const [quantityExecuted, setQuantityExecuted] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [warning, setWarning] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const addPhotos = async (fromCamera) => {
    const picked = await pickPhoto(fromCamera);
    if (picked?.length) setPhotos((prev) => [...prev, ...picked]);
  };

  const removePhoto = (uri) => setPhotos((prev) => prev.filter((p) => p.uri !== uri));

  const submit = async () => {
    if (submitting) return;
    setError(''); setInfo(''); setWarning('');
    if (!date || quantityExecuted === '') {
      setError('La fecha y la cantidad ejecutada son obligatorias');
      return;
    }
    if (Number(quantityExecuted) < 0) {
      setError('La cantidad no puede ser negativa');
      return;
    }
    setSubmitting(true);
    const fields = { date, quantityExecuted, notes };
    try {
      const formData = new FormData();
      Object.entries(fields).forEach(([k, v]) => formData.append(k, String(v ?? '')));
      photos.forEach((p) => formData.append('photos', { uri: p.uri, name: p.name, type: p.type }));
      const res = await progressApi.createEntry(projectId, item.id, formData);
      if (res.warning) setWarning(res.warning);
      setInfo('Avance registrado correctamente.');
      setQuantityExecuted(''); setNotes(''); setPhotos([]);
    } catch (err) {
      if (err.response) {
        setError(extractError(err));
      } else {
        await enqueue({ kind: 'progress', projectId, itemId: item.id, fields, photos, photosField: 'photos' });
        setInfo('Sin conexión: el avance se guardó en el celular y se enviará solo cuando vuelva la señal.');
        setQuantityExecuted(''); setNotes(''); setPhotos([]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Card style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{item.description}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              Presupuestado: {Number(item.quantity)} {item.unit} · Ejecutado: {item.accumulatedQty} ({item.percent}%)
            </Text>
            <Pressable onPress={onBack} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 13 }}>← Elegir otro ítem</Text>
            </Pressable>
          </Card>

          <Input label="Fecha" value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" />
          <Input label={`Cantidad ejecutada (${item.unit})`} value={quantityExecuted} onChangeText={setQuantityExecuted} keyboardType="numeric" placeholder="0" />
          <Input label="Notas (opcional)" value={notes} onChangeText={setNotes} multiline />

          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8, fontWeight: '500' }}>Fotos del avance</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {photos.map((p) => (
              <Pressable key={p.uri} onPress={() => removePhoto(p.uri)}>
                <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Button title="📷 Tomar foto" variant="secondary" onPress={() => addPhotos(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="🖼️ Galería" variant="secondary" onPress={() => addPhotos(false)} />
            </View>
          </View>

          <ErrorText>{error}</ErrorText>
          <WarningBanner>{warning}</WarningBanner>
          {info ? <Text style={{ color: colors.success, fontSize: 14, marginBottom: 8 }}>{info}</Text> : null}

          <Button title="Guardar avance" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
