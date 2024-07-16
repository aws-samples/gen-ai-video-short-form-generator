import React, { useEffect, useState } from 'react';
import {
  Container,
  Header,
  TextContent
} from '@cloudscape-design/components';
import { downloadData } from 'aws-amplify/storage';



interface TranscribeComponentProps {
  id: string;
}

const TranscribeComponent: React.FC<TranscribeComponentProps> = (props) => {

  const [value, setValue] = useState("");

  useEffect(() => {
    downloadData({
      path: `videos/${props.id}/Transcript.json`,
      options: {
        useAccelerateEndpoint: true
      },
    }).result
    .then((data) => data.body.text())
    .then((text) => {
      const json = JSON.parse(text);
      setValue(json.results.transcripts[0].transcript);
    })
    .catch((error) => {
      console.log(error);
    })
  }, [])


  return (
    <Container
      header={
        <Header variant="h2">
          Transcript
        </Header>
      }>
      
      {/* <Textarea
          value={value}
          rows={10}
          onChange={({ detail }) => setValue(detail.value)}
      /> */}
      <TextContent>
        <p style={{maxHeight: "60vh", overflow: "scroll"}}>
          {value}
        </p>
      </TextContent>
    </Container>
  );
};

export default TranscribeComponent;
