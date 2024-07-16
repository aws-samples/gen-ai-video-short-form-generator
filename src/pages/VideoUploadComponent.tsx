// VideoUploadComponent.tsx

import React, { useState } from 'react';
import { Container, Header, Tiles, Select } from '@cloudscape-design/components';
import { StorageManager } from '@aws-amplify/ui-react-storage';
import { useNavigate } from 'react-router-dom';
import { createHistory } from '../apis/history';
import { modelOptions } from '../data/modelList';

const VideoUploadComponent: React.FC = () => {

  const options = modelOptions.map(model => ({
    label: model.name,
    value: model.modelId,
  }))

  const [tileValue, setTileValue] = useState("upload");
  const [selectedModel, setSelectedModel] = useState({
    label: "Claude 3.0 Sonnet",
    value: "anthropic.claude-3-sonnet-20240229-v1:0",
  });
  const navigate = useNavigate();


  const processFile = async ({file, key}: {file:File, key:string}) => {
    
    const history = await createHistory(key, selectedModel.value);
  
    return { file, key: `${history!.id}/RAW.mp4`, useAccelerateEndpoint:true};
  };

  return (
    <Container
      header={
        <Header variant="h2">
          Upload Video
        </Header>
      }
    >
      <Tiles
        onChange={({ detail }) => setTileValue(detail.value)}
        value={tileValue}
        items={[
          { label: "Direct Upload", value: "upload" },
          { label: "Link", value: "link", disabled: true }
        ]}
      />
      <h3>Select LLM</h3>
      <Select
        selectedOption={selectedModel}
        onChange={({ detail }) => 
          setSelectedModel(detail.selectedOption as { label: string; value: string })
        }
        options={options}
        placeholder="Select the LLM model"
      />
      <br />
      {tileValue === "upload" && (
        <StorageManager
          acceptedFileTypes={['video/*']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFile}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            navigate(`/history/${uuid}`)
          }}
        />
      )}
    </Container>
  );
};

export default VideoUploadComponent;