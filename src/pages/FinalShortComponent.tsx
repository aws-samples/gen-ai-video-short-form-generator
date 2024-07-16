import React, { useEffect, useState } from 'react';
import { Container, Header, Spinner } from '@cloudscape-design/components';
import { getUrl } from 'aws-amplify/storage';
import { useParams } from 'react-router-dom';

const FinalShortComponent: React.FC = () => {
  const { id, highlight } = useParams();
  const [videoUrl, setVideoUrl] = useState('');

  useEffect(() => {
    const fetchVideoUrl = async () => {
      try {
        const file = await getUrl({
          path: `videos/${id}/Final/${highlight}-square-final.mp4`,
          options: {
            validateObjectExistence: true,
            useAccelerateEndpoint: true,
          },
        });
        setVideoUrl(file.url.toString());
      } catch (err) {
        setTimeout(fetchVideoUrl, 10000);
      }
    };

    fetchVideoUrl();
  }, [id, highlight]);


  return (
    <Container
      header={
        <Header variant="h2">
          Final Short
        </Header>
      }
    >
      {
        videoUrl === "" ? <Spinner /> :
        <video src={videoUrl} width="30%" controls />
      }
    </Container>
  );
};

export default FinalShortComponent;