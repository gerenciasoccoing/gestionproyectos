import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { projectsApi } from '../api';
import { extractError } from '../api/client';
import { Button, EmptyState, ErrorText, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { getQueue } from '../offline/queue';

const STATUS_LABEL = { activo: 'Activo', suspendido: 'Suspendido', terminado: 'Terminado', liquidado: 'Liquidado' };

// GET /projects ya devuelve SOLO los proyectos asignados al usuario (o todos si es admin) — es el
// mismo filtro por rol que usa la web (ver backend/src/controllers/projectController.js#list), no
// se repite ninguna lógica de asignación acá.
export default function ProjectsListScreen({ navigation }) {
  const { user, can, logout } = useAuth();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await projectsApi.list();
      setProjects(data);
    } catch (err) {
      setError(extractError(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => {
    getQueue().then((q) => setPendingCount(q.length));
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setPendingCount((await getQueue()).length);
    setRefreshing(false);
  };

  const canProgress = can('ejecucion', 'create');
  const canExpense = can('gastos', 'create');

  return (
    <Screen>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 14, color: colors.muted }}>Hola, {user?.name}</Text>
        {pendingCount > 0 && (
          <Text style={{ fontSize: 13, color: colors.warning, marginTop: 4 }}>
            ⏳ {pendingCount} registro(s) pendiente(s) por sincronizar
          </Text>
        )}
        {!canProgress && !canExpense && (
          <ErrorText>Tu usuario no tiene permiso para registrar avances ni gastos desde la app. Contacta a un administrador.</ErrorText>
        )}
      </View>

      <ErrorText>{error}</ErrorText>

      <FlatList
        data={projects || []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={projects ? <EmptyState>No tienes proyectos asignados todavía.</EmptyState> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, projectName: item.name })}
            style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{item.name}</Text>
            {item.client ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{item.client}</Text> : null}
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>{STATUS_LABEL[item.status] || item.status}</Text>
          </Pressable>
        )}
      />

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Button title="Cerrar sesión" variant="secondary" onPress={logout} />
      </View>
    </Screen>
  );
}
