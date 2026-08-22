import { useEffect, useState } from 'react';
import { staffClient, fileUrl } from '../../api/client';
import { formatCurrency } from '../../utils/format';

const EMPTY_FORM = {
  name: '', price: '', categoryId: '', stock: '', lowStockThreshold: '5', description: '',
};

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [imageFiles, setImageFiles] = useState(null);

  const load = () => staffClient.get('/tenant/products').then((res) => setProducts(res.data));

  useEffect(() => {
    load();
    staffClient.get('/tenant/categories').then((res) => setCategories(res.data));
  }, []);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setImageFiles(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        name: form.name,
        price: Number(form.price),
        categoryId: form.categoryId || null,
        description: form.description,
        lowStockThreshold: Number(form.lowStockThreshold) || 5,
      };
      let productId = editingId;
      if (editingId) {
        await staffClient.put(`/tenant/products/${editingId}`, payload);
      } else {
        const res = await staffClient.post('/tenant/products', { ...payload, stock: Number(form.stock) || 0 });
        productId = res.data.id;
      }
      if (imageFiles?.length) {
        const data = new FormData();
        Array.from(imageFiles).forEach((file) => data.append('images', file));
        await staffClient.post(`/tenant/products/${productId}/images`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el producto');
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      price: p.price,
      categoryId: p.categoryId || '',
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      description: p.description || '',
    });
  };

  const toggleActive = async (p) => {
    await staffClient.put(`/tenant/products/${p.id}`, { active: !p.active });
    load();
  };

  const remove = async (p) => {
    if (!window.confirm(`¿Eliminar "${p.name}"?`)) return;
    await staffClient.delete(`/tenant/products/${p.id}`);
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Productos</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 mb-6 grid sm:grid-cols-2 gap-3">
        <input name="name" value={form.name} onChange={handleChange} placeholder="Nombre" required className="border border-gray-300 rounded-lg px-3 py-2" />
        <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={handleChange} placeholder="Precio" required className="border border-gray-300 rounded-lg px-3 py-2" />
        <select name="categoryId" value={form.categoryId} onChange={handleChange} className="border border-gray-300 rounded-lg px-3 py-2">
          <option value="">Sin categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!editingId && (
          <input name="stock" type="number" min="0" value={form.stock} onChange={handleChange} placeholder="Stock inicial" className="border border-gray-300 rounded-lg px-3 py-2" />
        )}
        <input name="lowStockThreshold" type="number" min="0" value={form.lowStockThreshold} onChange={handleChange} placeholder="Alerta de stock bajo" className="border border-gray-300 rounded-lg px-3 py-2" />
        <input type="file" accept="image/*" multiple onChange={(e) => setImageFiles(e.target.files)} className="sm:col-span-2 text-sm" />
        <textarea name="description" value={form.description} onChange={handleChange} placeholder="Descripción" className="sm:col-span-2 border border-gray-300 rounded-lg px-3 py-2" rows={2} />
        {error && <p className="sm:col-span-2 text-red-500 text-sm">{error}</p>}
        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">{editingId ? 'Guardar cambios' : 'Crear producto'}</button>
          {editingId && <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border border-gray-300">Cancelar</button>}
        </div>
      </form>

      <div className="bg-white rounded-xl shadow-sm divide-y">
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="h-12 w-12 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
              {p.images?.[0] ? <img src={fileUrl(p.images[0])} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-xs text-gray-300">—</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-medium truncate ${p.active ? 'text-gray-800' : 'text-gray-400'}`}>{p.name}</p>
              <p className="text-sm text-gray-500">{formatCurrency(p.price)} · Stock: {p.stock}</p>
            </div>
            <div className="flex gap-3 text-sm shrink-0">
              <button type="button" onClick={() => startEdit(p)} className="text-indigo-600">Editar</button>
              <button type="button" onClick={() => toggleActive(p)} className="text-gray-500">{p.active ? 'Desactivar' : 'Activar'}</button>
              <button type="button" onClick={() => remove(p)} className="text-red-500">Eliminar</button>
            </div>
          </div>
        ))}
        {products.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">No hay productos todavía.</p>}
      </div>
    </div>
  );
}
