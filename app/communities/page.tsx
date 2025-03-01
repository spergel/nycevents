'use client';
import React, { useState, useEffect } from 'react';
import communities from '@/public/data/communities.json';
import { Panel } from '@/app/components/ui/Panel';
import { FilterButton } from '@/app/components/ui/FilterButton';
import Loading from '@/app/loading';

export default function Communities() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  useEffect(() => {
    if (document.readyState === 'complete') {
      setIsLoading(false);
    } else {
      const handleLoad = () => {
        setIsLoading(false);
      };
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  const communityTypes = Array.from(new Set(communities.communities.map(c => c.type)));

  const filteredCommunities = communities.communities.filter(community =>
    selectedTypes.length === 0 || selectedTypes.includes(community.type)
  );

  const toggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  if (isLoading) return <Loading />;

  return (
    <main className="page-layout">
      <div className="two-column-layout">
        <div className="main-section">
          <Panel title="NYC COMMUNITIES DIRECTORY" systemId="COM-001">
            <div className="items-grid">
              {filteredCommunities.map((community) => (
                <a key={community.id} href={`/communities/${community.id}`} className="item-card">
                  <div className="card-header">
                    <div className="header-left">
                      <span className="community-type">{community.type}</span>
                      <span className="community-founded">EST. {community.founded}</span>
                    </div>
                    <div className="header-status" />
                  </div>
                  <div className="community-name">{community.name}</div>
                  <div className="categories-container">
                    {community.category.map((cat: string, i: number) => (
                      <span key={i} className="category-tag">{cat}</span>
                    ))}
                  </div>
                  <div className="card-footer">
                    <div className="footer-line" />
                    <div className="footer-dots">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="dot" />
                      ))}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </Panel>
        </div>

        <div className="filters-section">
          <Panel title="COMMUNITY TYPES" systemId="TYPE-001" variant="secondary">
            <div className="filters-content">
              <div className="filter-options">
                {communityTypes.map((type) => (
                  <FilterButton
                    key={type}
                    label={type}
                    count={communities.communities.filter(c => c.type === type).length}
                    isActive={selectedTypes.includes(type)}
                    onClick={() => toggleType(type)}
                  />
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <style jsx>{`
        .header-left {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .header-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--nyc-orange);
          box-shadow: 0 0 10px var(--nyc-orange);
          animation: pulse 2s infinite;
        }

        .community-type {
          color: var(--terminal-color);
          font-family: var(--font-mono);
          font-size: 0.8rem;
          padding: 0.2rem 0.5rem;
          background: rgba(0, 255, 255, 0.1);
          border-radius: 2px;
        }

        .community-founded {
          color: var(--nyc-orange);
          font-family: var(--font-mono);
          font-size: 0.8rem;
        }

        .community-name {
          font-family: var(--font-display);
          font-size: 1.1rem;
          margin-bottom: 0.5rem;
          color: var(--nyc-white);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-footer {
          margin-top: auto;
          padding-top: 0.5rem;
        }

        .footer-line {
          height: 1px;
          background: var(--terminal-color);
          opacity: 0.3;
          margin-bottom: 0.5rem;
        }

        .footer-dots {
          display: flex;
          gap: 0.25rem;
          justify-content: center;
        }

        .dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--terminal-color);
          opacity: 0.5;
        }

        .item-card:hover .dot {
          background: var(--nyc-orange);
          opacity: 1;
        }

        @media (max-width: 768px) {
          .community-name {
            font-size: 1rem;
          }
        }

        @media (max-width: 480px) {
          .community-name {
            font-size: 0.95rem;
          }
        }
      `}</style>
    </main>
  );
} 