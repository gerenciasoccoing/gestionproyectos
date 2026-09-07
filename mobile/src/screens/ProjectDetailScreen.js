import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

// Únicos dos accesos de esta app (ver alcance acordado): registrar avance de obra y registrar
// gasto. Cada botón se muestra solo si el usuario tiene el permiso correspondiente — el mismo
// "ejecucion:create"/"gastos:create" que usa el botón equivalente en la web (componente Can).
export default function ProjectDetailScreen({ route, navigation }) {
  const { projectId, projectName } = route.params;
  const { can } = useAuth();
  const canProgress = can('ejecucion', 'create');
  const canExpense = can('gastos', 'create');

  return (
    <Screen>
      <View style={{ padding: 16, gap: 14 }}>
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{projectName}</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>Elige qué quieres registrar en este proyecto</Text>
        </Card>

        {canProgress && (
          <Button
            title="📋 Registrar avance de obra"
            onPress={() => navigation.navigate('RegisterProgress', { projectId, projectName })}
          />
        )}

        {canExpense && (
          <Button
            title="💵 Registrar gasto"
            variant={canProgress ? 'secondary' : 'primary'}
            onPress={() => navigation.navigate('RegisterExpense', { projectId, projectName })}
          />
        )}

        {!canProgress && !canExpense && (
          <EmptyState>Tu usuario no tiene permiso para registrar avances ni gastos en este proyecto.</EmptyState>
        )}
      </View>
    </Screen>
  );
}
