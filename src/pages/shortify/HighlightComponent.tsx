import React, { useEffect, useState } from 'react';
import {
  Tabs, Spinner, Box,
  NonCancelableCustomEvent,
  TabsProps
} from '@cloudscape-design/components';
import { type Highlight, readHighlight } from '../../apis/highlight';

interface HighlightComponentProps {
  id: string;
  onTabChange: (tab: number, title:string) => void;
}

const HighlightComponent: React.FC<HighlightComponentProps> = (props) => {

  const [ loading, setLoading ] = useState(true);
  const [ highlights, setHighlights ] = useState<Highlight[]>([]);

  useEffect(() => {
    readHighlight(props.id).then((highlights) => {
      setHighlights(highlights);
      props.onTabChange(0, highlights[0].Question!);
    }).then(() => setLoading(false))
  }, [])

  const handleTabClick = (e:NonCancelableCustomEvent<TabsProps.ChangeDetail>) => {
    const clicked = Number(e.detail.activeTabId.split("-")[1]);
    props.onTabChange(clicked, highlights[clicked].Question!);

  }

  if(loading)
    return <Box textAlign='center'><Spinner size='large'/></Box>

  return (
    <Tabs
      tabs={
        highlights.map((highlight, idx) => {
          return {
            id: `video-${idx}`,
            label: `# ${idx+1}`,
            content: 
            <div>
              <h3>{highlight.Question}</h3>
              <div>{highlight.Text}</div>
              <br />
            </div>
          }
        })
      }
      variant="container"
      onChange={handleTabClick}
    />
  );
};

export default HighlightComponent;
