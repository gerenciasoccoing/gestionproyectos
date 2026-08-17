import { useEffect, useState } from 'react';
import { staffClient } from '../../api/client';

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = () => staffClient.get('/tenant/categories').then((res) => setCategories(res.data));

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await staffClient.post('/tenant/categories', { name });
      setName('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la categoría');
    }
  };

  const toggleActive = async (category) => {
    await staffClient.put(`/tenant/categories/${category.id}`, { active: !category.active });
    load();
  };

  const remove = async (category) => {
    if (!window.confirm(`¿Eliminar la categoría "${category.name}"?`)) return;
    await staffClient.delete(`/tenant/categories/${category.id}`);
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Categorías</h1>
      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la categoría" className="border border-gray-300 rounded-lg px-3 py-2 flex-1" required />
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">Agregar</button>
      </form>
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm divide-y">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-4 py-3">
            <span className={c.active ? 'text-gray-800' : 'text-gray-400 line-through'}>{c.name}</span>
            <div className="flex gap-3 text-sm">
              <button type="button" onClick={() => toggleActive(c)} className="text-indigo-600">{c.active ? 'Desactivar' : 'Activar'}</button>
              <button type="button" onClick={() => remove(c)} className="text-red-500">Eliminar</button>
            </div>
          </div>
        ))}
        {categories.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">No hay categorías todavía.</p>}
      </div>
    </div>
  );
}
