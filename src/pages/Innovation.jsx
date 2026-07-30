import { useState } from 'react';
import { Icon } from '../components/Icon';
import { PageHeader, Button, StatusBadge } from '../components/common';
import { projects, problems, problemStatus } from '../data/mock';

function ProjectCard({ item }) {
  return (
    <div className="card project-card">
      <div className="card-header">
        <span className="status status-info">{item.status}</span>
      </div>
      <h3>{item.title}</h3>
      <p className="card-desc">{item.summary}</p>
      <div className="card-meta"><span><Icon name="users" size={15} />{item.team}</span></div>
    </div>
  );
}

export function Innovation() {
  const [activeTab, setActiveTab] = useState('projects');
  
  return (
    <div className="page">
      <PageHeader title="Góc đổi mới sáng tạo" action={activeTab === 'problems' ? <Button icon="search" variant="secondary">Gửi bài toán</Button> : null} />
      <div className="tabs">
        <button className={`tab ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>Công trình, sáng kiến</button>
        <button className={`tab ${activeTab === 'problems' ? 'active' : ''}`} onClick={() => setActiveTab('problems')}>Bài toán, điểm nghẽn</button>
      </div>
      
      <div style={{ padding: '16px' }}>
        {activeTab === 'projects' ? (
          <div className="list card-list">
            {projects.map(p => <ProjectCard key={p.id} item={p} />)}
          </div>
        ) : (
          <div className="list card-list">
            {problems.map(p => (
              <div key={p.id} className="card problem-card">
                <div className="card-header">
                  <h3>{p.title}</h3>
                  <StatusBadge label={problemStatus[p.status][0]} tone={problemStatus[p.status][1]} />
                </div>
                <div className="card-meta"><span><Icon name="calendar" size={15}/>{p.date}</span><span><Icon name="users" size={15}/>{p.organization}</span></div>
                <div className="problem-update"><strong>Cập nhật mới nhất:</strong> {p.update}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
