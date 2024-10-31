// VideoUploadComponent.tsx

import React, { useEffect, useState } from 'react';
import { Container, Header, Tiles, Select, Alert } from '@cloudscape-design/components';
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
  const [uuid, setUuid] = useState("");
  const [selectedModel, setSelectedModel] = useState({
    label: "Claude 3.0 Sonnet",
    value: "anthropic.claude-3-sonnet-20240229-v1:0",
  });
  const navigate = useNavigate();

  useEffect(() => {
  }, [uuid])


  const processFile = async ({file, key}: {file:File, key:string}) => {
    
    const history = await createHistory(key, selectedModel.value);
  
    return { file, key: `${history!.id}/RAW.mp4`, useAccelerateEndpoint:true};
  };

  const processFileForSubtitle = async ({file, key}: {file:File, key:string}) => {
    
    const history = await createHistory(key, selectedModel.value);
  
    return { file, key: `${history?.id}/Transcript.json`, useAccelerateEndpoint:true};
  };

  const processFileForVideo = async ({file}: {file:File, key:string}) => {
      
    return { file, key: `${uuid}/RAW.mp4`, useAccelerateEndpoint:true};
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
          { label: "Upload with Subtitle", value: "subtitle" },
          { label: "Link", value: "link", disabled: true },
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
      {tileValue === "subtitle" && (
        <>
        <h3>Upload Subtitle</h3>
        <StorageManager
          acceptedFileTypes={['.json']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFileForSubtitle}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            setUuid(uuid)
          }}
        />
        <h3>Upload Video</h3>
        {uuid === "" ?     
        <Alert
          statusIconAriaLabel="Info"
        >
          You can upload video after uploading subtitle.
        </Alert> :
        <StorageManager
          acceptedFileTypes={['video/*']}
          path={`videos/`}
          maxFileCount={1}
          isResumable
          autoUpload={false}
          processFile={processFileForVideo}
          onUploadSuccess={({key})=> {
            const uuid = key!.split('/')[1];
            navigate(`/history/${uuid}`)
          }}
        />}
        </>
      )}
    </Container>
  );
};

export default VideoUploadComponent;