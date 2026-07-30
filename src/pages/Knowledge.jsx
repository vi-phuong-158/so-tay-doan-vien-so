import { useState } from 'react';
import { Icon } from '../components/Icon';
import { PageHeader, Button } from '../components/common';
import { documents, topics } from '../data/mock';

function DocumentCard({ item }) {
  return (
    <div className="card doc-card">
      <div className="doc-icon"><Icon name="file" /></div>
      <div className="doc-content">
        <div className="doc-meta"><span>{item.type}</span> • <span>{item.number}</span></div>
        <h3>{item.title}</h3>
        <div className="doc-footer"><span>{item.date}</span><span className={`status ${item.effective === 'Còn hiệu lực' || item.effective === 'Đang áp dụng' ? 'status-success' : 'status-neutral'}`}>{item.effective}</span></div>
      </div>
    </div>
  );
}

export function Knowledge() {
  const [activeTab, setActiveTab] = useState('docs');
  return (
    <div className="page">
      <PageHeader title="Tri thức & Văn bản" action={<Button icon="search" variant="secondary">Tìm kiếm</Button>} />
      <div className="tabs">
        <button className={`tab ${activeTab === 'docs' ? 'active' : ''}`} onClick={() => setActiveTab('docs')}>Văn bản, biểu mẫu</button>
        <button className={`tab ${activeTab === 'topics' ? 'active' : ''}`} onClick={() => setActiveTab('topics')}>Chuyên đề học tập</button>
      </div>
      
      <div style={{ padding: '16px' }}>
        {activeTab === 'docs' ? (
          <div className="list card-list">
            <div className="filters scroll-x">
              <button className="filter-chip active">Tất cả</button>
              <button className="filter-chip">Hướng dẫn</button>
              <button className="filter-chip">Kế hoạch</button>
              <button className="filter-chip">Biểu mẫu</button>
            </div>
            {documents.map(d => <DocumentCard key={d.id} item={d} />)}
          </div>
        ) : (
          <div className="list card-list">
             {topics.map(t => (
               <div key={t.id} className="card topic-card">
                 <div className="card-header">
                   <h3>{t.title}</h3>
                   <span className={`status ${t.status === 'Hoàn thành' ? 'status-success' : t.status === 'Đang học' ? 'status-info' : 'status-neutral'}`}>{t.status}</span>
                 </div>
                 <div className="card-meta"><span><Icon name="clock" size={15}/>{t.duration}</span><span><Icon name="file" size={15}/>{t.resources} tài liệu</span></div>
                 <div className="progress"><span style={{width: `${t.progress}%`}}></span></div>
               </div>
             ))}
          </div>
        )}
      </div>
      <button className="fab" aria-label="Hỏi AI"><Icon name="sparkles" size={24} /></button>
    </div>
  );
}
