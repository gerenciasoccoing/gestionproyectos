import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { cashBoxesApi, EXPENSE_CATEGORIES, expensesApi } from '../api';
import { extractError } from '../api/client';
import { Button, Card, ChipSelect, ErrorText, Input, Screen } from '../components/ui';
import { enqueue } from '../offline/queue';
import { colors } from '../theme';

const CATEGORY_LABELS = {
  mano_obra: 'Mano de obra',
  materiales: 'Materiales',
  equipos: 'Equipos',
  viaticos: 'Viáticos',
  imprevistos: 'Imprevistos',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function pickSinglePhoto(fromCamera) {
  const permission = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.fileName || `archivo-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' };
}

function PhotoField({ label, value, onPick, onClear }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: '500' }}>{label}</Text>
      {value ? (
        <Pressable onPress={onClear}>
          <Image source={{ uri: value.uri }} style={{ width: 96, height: 96, borderRadius: 8 }} />
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>Toca para quitar</Text>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title="📷 Cámara" variant="secondary" onPress={() => onPick(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="🖼️ Galería" variant="secondary" onPress={() => onPick(false)} />
          </View>
        </View>
      )}
    </View>
  );
}

// Reusa el mismo endpoint que el formulario de Gastos en la web (categorías/validaciones idénticas,
// ver backend/src/controllers/expenseController.js#create) — no se duplica el modelo de datos.
export default function RegisterExpenseScreen({ route }) {
  const { projectId } = route.params;
  const [cashBoxes, setCashBoxes] = useState(null);
  const [cashBoxError, setCashBoxError] = useState('');

  const [category, setCategory] = useState('materiales');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [cashBoxId, setCashBoxId] = useState(null);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [paymentReceiptFile, setPaymentReceiptFile] = useState(null);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    cashBoxesApi.list()
      .then((data) => {
        setCashBoxes(data);
        if (data.length === 1) setCashBoxId(data[0].id);
      })
      .catch((err) => setCashBoxError(extractError(err)));
  }, []);

  const submit = async () => {
    if (submitting) return;
    setError(''); setInfo('');
    if (!amount || Number(amount) < 0) { setError('El valor es obligatorio y no puede ser negativo'); return; }
    if (!date) { setError('La fecha es obligatoria'); return; }
    if (!cashBoxId) { setError('Debes elegir la caja de origen'); return; }

    setSubmitting(true);
    const fields = { category, amount, date, description, cashBoxId };
    const singleFiles = { invoiceFile, paymentReceiptFile };
    try {
      const formData = new FormData();
      Object.entries(fields).forEach(([k, v]) => formData.append(k, String(v ?? '')));
      Object.entries(singleFiles).forEach(([field, file]) => {
        if (file) formData.append(field, { uri: file.uri, name: file.name, type: file.type });
      });
      await expensesApi.create(projectId, formData);
      setInfo('Gasto registrado correctamente.');
      setAmount(''); setDescription(''); setInvoiceFile(null); setPaymentReceiptFile(null);
    } catch (err) {
      if (err.response) {
        setError(extractError(err));
      } else {
        await enqueue({ kind: 'expense', projectId, fields, singleFiles });
        setInfo('Sin conexión: el gasto se guardó en el celular y se enviará solo cuando vuelva la señal.');
        setAmount(''); setDescription(''); setInvoiceFile(null); setPaymentReceiptFile(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <ChipSelect
            label="Categoría"
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
            value={category}
            onChange={setCategory}
          />
          <Input label="Valor" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" />
          <Input label="Fecha" value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" />
          <Input label="Concepto (opcional)" value={description} onChangeText={setDescription} multiline />

          {cashBoxError ? (
            <ErrorText>No se pudieron cargar las cajas ({cashBoxError}). Contacta a un administrador si necesitas permiso para verlas.</ErrorText>
          ) : (
            <ChipSelect
              label="Caja de origen"
              options={(cashBoxes || []).map((c) => ({ value: c.id, label: c.name }))}
              value={cashBoxId}
              onChange={setCashBoxId}
            />
          )}

          <PhotoField label="Factura" value={invoiceFile} onPick={async (fromCamera) => setInvoiceFile(await pickSinglePhoto(fromCamera))} onClear={() => setInvoiceFile(null)} />
          <PhotoField label="Comprobante de pago" value={paymentReceiptFile} onPick={async (fromCamera) => setPaymentReceiptFile(await pickSinglePhoto(fromCamera))} onClear={() => setPaymentReceiptFile(null)} />

          <ErrorText>{error}</ErrorText>
          {info ? <Text style={{ color: colors.success, fontSize: 14, marginBottom: 8 }}>{info}</Text> : null}

          <Button title="Guardar gasto" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
